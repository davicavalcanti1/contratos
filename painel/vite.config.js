import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// O painel é servido pelo próprio Express em /painel (build em public/painel).
// Em desenvolvimento (`npm run dev:painel`), o Vite repassa a API para o
// servidor em :3000 — mesmo domínio, então o cookie SameSite=Strict funciona.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/painel/',
  plugins: [react()],
  build: { outDir: '../public/painel', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/painel/api': 'http://localhost:3000',
      '/estatico': 'http://localhost:3000',
      '/v/': 'http://localhost:3000',
    },
  },
})
