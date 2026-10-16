// Sobe o servidor. Configuração por variável de ambiente:
//
//   PORT                 porta (padrão 3000)
//   BASE_URL             URL pública, usada nos links, no QR e nos convites (padrão http://localhost:PORT)
//   DADOS_DIR            onde ficam as coleções JSON e os PDFs (padrão ./dados)
//   ORGANIZACOES_ARQUIVO opcional: importa organizações no formato antigo { id: { api_key, dados } }
//   NODE_ENV=production  desliga /dev, exige https nos webhooks e não cria contas de teste
//
// Primeiro developer em produção: `node src/cli.js developer <email> "<nome completo>"`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { criarRepo } from '../armazenamento/repo.js'
import { criarServico } from '../assinatura/servico.js'
import { carregarBiblioteca } from '../biblioteca.js'
import { criarLotes } from '../lote/lotes.js'
import { lintModelo } from '../motor/linter.js'
import { transporteCaixa } from '../notificacoes.js'
import { criarPlataforma } from '../plataforma/plataforma.js'
import { criarWebhooks } from '../plataforma/webhooks.js'
import { criarApp } from './app.js'

const producao = process.env.NODE_ENV === 'production'
const porta = Number(process.env.PORT || 3000)
const baseUrl = (process.env.BASE_URL || `http://localhost:${porta}`).replace(/\/$/, '')

const biblioteca = carregarBiblioteca()
// Modelo que não passa no linter não sobe: é a mesma régua da publicação.
for (const m of biblioteca.modelos) {
  const r = lintModelo(m, biblioteca.indice)
  if (!r.ok) throw new Error(`Modelo ${m.chave} reprovado no linter: ${r.graves.map(g => g.msg).join('; ')}`)
}

const repo = criarRepo({ dir: process.env.DADOS_DIR || join(process.cwd(), 'dados') })
const notificar = transporteCaixa(repo)
const webhooks = criarWebhooks({ repo, producao })
const plataforma = criarPlataforma({ repo, notificar, config: { baseUrl } })
const servico = criarServico({ repo, biblioteca, notificar, config: { baseUrl }, aoEvento: webhooks.emitir })
const lotes = criarLotes({ repo, biblioteca, servico })

if (process.env.ORGANIZACOES_ARQUIVO) await plataforma.importarOrganizacoes(JSON.parse(readFileSync(process.env.ORGANIZACOES_ARQUIVO, 'utf8')))

// Ambiente de teste: uma organização de exemplo e duas contas prontas.
const CHAVE_DEV = 'dev-local'
const SENHA_DEV = 'senha-de-teste-local'
if (!producao) {
  await plataforma.importarOrganizacoes({
    'org-exemplo': { api_key: CHAVE_DEV, dados: JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8')) },
  })
  if (!plataforma.temDeveloper()) {
    plataforma.criarUsuarioDireto({ nome: 'Developer Local', email: 'dev@contratos.local', papel: 'developer', senha: SENHA_DEV })
    plataforma.criarUsuarioDireto({ organizacaoId: 'org-exemplo', nome: 'Maria Exemplo Souza', email: 'admin@clinica-exemplo.com.br', papel: 'org_admin', senha: SENHA_DEV })
  }
} else if (!plataforma.temDeveloper()) {
  console.warn('Nenhum developer cadastrado. Crie o primeiro: node src/cli.js developer <email> "<nome completo>"')
}

webhooks.iniciar()
const app = criarApp({ servico, lotes, plataforma, webhooks, repo, biblioteca, dev: !producao, chaveDev: producao ? null : CHAVE_DEV })

app.listen(porta, () => {
  console.log(`contratos-saas em ${baseUrl}/painel`)
  if (!producao) {
    console.log(`  logins de teste (senha "${SENHA_DEV}"): dev@contratos.local (plataforma), admin@clinica-exemplo.com.br (empresa)`)
    console.log(`  caixa de saída e contrato avulso: ${baseUrl}/dev`)
  }
})
