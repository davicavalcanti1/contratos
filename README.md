# contratos-saas (nome provisório)

SaaS de contratos, multi-tenant e independente: modelos inteligentes, contrato
gerado a partir dos dados da empresa e assinatura com validade jurídica.

> **Fase atual: refação página por página + armazenamento no Supabase.** As seis fases do plano estão feitas; o banco agora pode ser o Supabase (Postgres + Storage), ainda sem e-mail real. Onde paramos: [docs/STATUS.md](docs/STATUS.md).
> Origem: o módulo de contratos do ExameQR (`exam-qr-system`), generalizado.

## Rodar

```bash
npm install
npm run build             # compila o painel (React)
npm start                 # http://localhost:3000/painel  (e-mails de teste em /dev)
npm test                  # 127 testes: site, motor, assinatura, lote, plataforma, webhooks, vida, carimbo, ICP-Brasil, painel, HTTP
npm run lint:modelos      # linter jurídico em todos os modelos da biblioteca
npm run exemplos          # gera saida/*.pdf a partir de exemplos/*.json
```

Logins de teste (senha `senha-de-teste-local`): `dev@contratos.local` (plataforma) e
`admin@clinica-exemplo.com.br` (empresa de exemplo). Ver [docs/PLATAFORMA.md](docs/PLATAFORMA.md).

### Armazenamento

Sem configuração, tudo fica em JSON na pasta `dados/` (ou `DADOS_DIR`). Com
duas variáveis, tudo mora no Supabase e a memória é só a cópia de trabalho:

```powershell
$env:SUPABASE_URL = "https://<ref>.supabase.co"
$env:SUPABASE_KEY = "<service_role>"   # nunca a anon, nunca no front
npm start
```

O esquema é uma tabela `registros` (coleção + id + JSON) e um bucket privado
`arquivos`; está em `supabase/migrations/0001_registros.sql`. O servidor carrega
tudo ao subir e grava cada escrita em seguida, numa fila que tenta de novo se a
rede falhar (`src/armazenamento/supabase.js`). Vale para uma instância.

`exemplos/com-erros.json` é recusado de propósito: mostra o motor dizendo **o
que falta e onde resolver**, em vez de mandar lacuna para assinatura.

## O que tem aqui

| Caminho | O quê |
|---|---|
| `biblioteca/clausulas.json` | **semente** das cláusulas versionadas (bula, crítica, base legal). Em execução, a biblioteca mora no armazenamento e é editada em Plataforma → Biblioteca; só o publicado chega às organizações |
| `biblioteca/modelos/` | modelos = blocos de cláusula + regras + variáveis tipadas. `prestacao_servicos` cobre PF, PJ e MEI; `termo_confidencialidade_colaborador` é para a empresa inteira; `termo_aditivo` e `distrato` nascem de um contrato assinado |
| `src/motor/tipos.js` | tipos de variável: CPF/CNPJ com dígito, moeda com extenso, data, endereço, enum… |
| `src/motor/regras.js` | regras declarativas (`eq`, `in`, `gte`, `e`/`ou`/`nao`) |
| `src/motor/montar.js` | modelo + dados → contrato numerado, com `faltando`/`invalidos` e hash do conteúdo |
| `src/motor/linter.js` | confere o modelo em **todas** as combinações de regras antes de publicar |
| `src/motor/pdf.js` | PDF com cláusula crítica em destaque (CDC 54 §4º); na via final, QR + código em cada página e página de assinaturas |
| `src/assinatura/` | serviço de assinatura (código, sessão, bula, selo), trilha encadeada, dossiê em PDF |
| `src/lote/` | planilha (CSV/XLSX do Excel brasileiro), mapeamento de colunas, prévia, lote e progresso |
| `src/vida/` | vigência, agenda (avisos e encerramento), índices de reajuste do Banco Central |
| `src/plugaveis/` | carimbo do tempo RFC 3161 e verificação de PDF assinado com certificado ICP-Brasil |
| `certs/icp-brasil/` | raízes oficiais do ITI (conferir as impressões digitais antes de produção) |
| `src/plataforma/` | organizações, usuários, convites, sessão, chaves de API, planos, auditoria e webhooks |
| `painel/` | painel em React + Vite (developer e organização), compilado para `public/painel` |
| `src/servidor/` | HTTP: API da organização, rotas do signatário, verificação pública, `/dev` |
| `public/` | site de apresentação (com a assinatura para experimentar e o motor ao vivo em `/api/demo/contrato`), tela de assinatura (mobile-first), assinatura em lote, página do selo e `/dev`. HTML/JS puros, sem build |

⚠️ O texto da biblioteca foi redigido a partir da legislação citada em cada
cláusula, mas **não passou por advogado**. Ver `docs/VALIDADE-JURIDICA.md` §6.

## Documentação

| Documento | O que responde |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | **Onde paramos**: telas refeitas, decisões, pendências e como retomar |
| [docs/VISION.md](docs/VISION.md) | Que dor resolve, para quem e o que fica de fora |
| [docs/ATUACAO.md](docs/ATUACAO.md) | Para quem vender, com que oferta e por que canal; o que falta no produto para isso |
| [docs/DIFERENCIAIS.md](docs/DIFERENCIAIS.md) | O que faz ele não ser "mais um DocuSign". **Decisões em aberto** |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Hierarquia, papéis, serviços internos, API e integrações |
| [docs/DOMINIO.md](docs/DOMINIO.md) | Entidades, motor de modelos, ciclo de vida do contrato |
| [docs/VALIDADE-JURIDICA.md](docs/VALIDADE-JURIDICA.md) | O que dá validade à assinatura, o que guardamos, o que não fazemos |
| [docs/ASSINATURA.md](docs/ASSINATURA.md) | Fase 2: fluxo do signatário, selo, dossiê, API, segurança e o que ainda é provisório |
| [docs/LOTE.md](docs/LOTE.md) | Fase 3: planilha → colunas → conferência → envio, e a empresa assinando tudo de uma vez |
| [docs/PLATAFORMA.md](docs/PLATAFORMA.md) | Fase 4: papéis, contas, planos, API, webhooks e painel |
| [docs/VIDA.md](docs/VIDA.md) | Fase 5: vigência, agenda, reajuste pelo índice, aditivo e distrato |
| [docs/PLUGAVEIS.md](docs/PLUGAVEIS.md) | Fase 6: carimbo do tempo, assinatura ICP-Brasil, e o ZapSign adiado |
