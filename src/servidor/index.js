// Sobe o servidor. Configuração por variável de ambiente:
//
//   PORT                 porta (padrão 3000)
//   BASE_URL             URL pública, usada nos links e no QR (padrão http://localhost:PORT)
//   DADOS_DIR            onde ficam as coleções JSON e os PDFs (padrão ./dados)
//   ORGANIZACOES_ARQUIVO JSON { "<id>": { "api_key": "...", "dados": { razao_social, cnpj, … } } }
//                        Sem ele, sobe a organização de exemplo com a chave "dev-local".
//   NODE_ENV=production  desliga /dev e exige ORGANIZACOES_ARQUIVO

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { criarRepo } from '../armazenamento/repo.js'
import { criarServico } from '../assinatura/servico.js'
import { carregarBiblioteca } from '../biblioteca.js'
import { lintModelo } from '../motor/linter.js'
import { transporteCaixa } from '../notificacoes.js'
import { criarApp } from './app.js'

const producao = process.env.NODE_ENV === 'production'
const porta = Number(process.env.PORT || 3000)
const baseUrl = (process.env.BASE_URL || `http://localhost:${porta}`).replace(/\/$/, '')

function carregarOrganizacoes() {
  if (process.env.ORGANIZACOES_ARQUIVO) return JSON.parse(readFileSync(process.env.ORGANIZACOES_ARQUIVO, 'utf8'))
  if (producao) throw new Error('Em produção, ORGANIZACOES_ARQUIVO é obrigatório (sem chave de API padrão).')
  return { 'org-exemplo': { api_key: 'dev-local', dados: JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8')) } }
}

const biblioteca = carregarBiblioteca()

// Modelo que não passa no linter não sobe: é a mesma régua da publicação.
for (const m of biblioteca.modelos) {
  const r = lintModelo(m, biblioteca.indice)
  if (!r.ok) throw new Error(`Modelo ${m.chave} reprovado no linter: ${r.graves.map(g => g.msg).join('; ')}`)
}

const repo = criarRepo({ dir: process.env.DADOS_DIR || join(process.cwd(), 'dados') })
const servico = criarServico({ repo, biblioteca, notificar: transporteCaixa(repo), config: { baseUrl } })
const app = criarApp({ servico, repo, biblioteca, organizacoes: carregarOrganizacoes(), dev: !producao })

app.listen(porta, () => {
  console.log(`contratos-saas em ${baseUrl}${producao ? '' : `  ·  painel de teste: ${baseUrl}/dev`}`)
})
