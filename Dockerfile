# BullaCheck: servidor Node com o painel compilado dentro da imagem.
# Qualquer host que rode Docker (EasyPanel, Railway, Render, Fly, VPS) sobe isto.
# Variáveis de ambiente: ver .env.example e docs/OPERACAO.md.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/biblioteca ./biblioteca
COPY --from=build /app/legislacao ./legislacao
COPY --from=build /app/exemplos ./exemplos
COPY --from=build /app/certs ./certs
# Diário de escritas pendentes do Supabase e PDFs sem Supabase: montar um disco persistente aqui.
RUN mkdir -p /app/dados && chown -R node:node /app
USER node
VOLUME ["/app/dados"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/saude || exit 1
CMD ["node", "src/servidor/index.js"]
