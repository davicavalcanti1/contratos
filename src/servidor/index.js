// Sobe o servidor. Configuração por variável de ambiente:
//
//   PORT                 porta (padrão 3000)
//   BASE_URL             URL pública, usada nos links, no QR e nos convites (padrão http://localhost:PORT)
//   DADOS_DIR            sem Supabase: coleções JSON e PDFs; com Supabase: o diário de escritas pendentes (padrão ./dados)
//   SUPABASE_URL         https://<ref>.supabase.co — liga o armazenamento no Supabase (Postgres + Storage)
//   RESEND_API_KEY       liga o e-mail real (Resend); EMAIL_REMETENTE é o "Nome <email@dominio>"; EMAIL_RESPONDER_PARA opcional
//   EMAIL_TRANSPORTE     =caixa para subir em produção sem e-mail, de propósito
//   SUPABASE_KEY         chave service_role do projeto (nunca a anon, nunca no front)
//   ORGANIZACOES_ARQUIVO opcional: importa organizações no formato antigo { id: { api_key, dados } }
//   NODE_ENV=production  desliga /dev, exige https nos webhooks e não cria contas de teste
//
// Primeiro developer em produção: `node src/cli.js developer <email> "<nome completo>"`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { criarRepo } from '../armazenamento/repo.js'
import { criarRepoSupabase } from '../armazenamento/supabase.js'
import { criarServico } from '../assinatura/servico.js'
import { criarBibliotecaViva } from '../biblioteca.js'
import { edicaoDoAmbiente } from '../edicao.js'
import { legislacaoPadrao } from '../legislacao/legislacao.js'
import { criarPartes } from '../partes.js'
import { criarLotes } from '../lote/lotes.js'
import { lintModelo } from '../motor/linter.js'
import { transporteDoAmbiente } from '../notificacoes.js'
import { criarAvisos } from '../plataforma/avisos.js'
import { criarDemonstracao } from '../plataforma/demonstracao.js'
import { criarExportacao } from '../plataforma/exportacao.js'
import { criarMarca } from '../plataforma/marca.js'
import { criarMetricas } from '../plataforma/metricas.js'
import { criarPlataforma } from '../plataforma/plataforma.js'
import { criarWebhooks } from '../plataforma/webhooks.js'
import { X509Certificate } from 'node:crypto'
import { carimbadorDoAmbiente } from '../plugaveis/carimbo.js'
import { carregarRaizesOficiais, criarVerificadorIcp } from '../plugaveis/icp.js'
import { criarAgenda } from '../vida/agenda.js'
import { criarIndices } from '../vida/indices.js'
import { criarApp } from './app.js'

const producao = process.env.NODE_ENV === 'production'
// EDICAO=basica liga só o que a primeira clínica usa (docs/BASICA.md); sem a variável, tudo.
const edicao = edicaoDoAmbiente(process.env)
// Em produção, o que falta derruba na subida, com a lista: melhor que descobrir no primeiro link.
if (producao) {
  const faltam = ['BASE_URL', 'SUPABASE_URL', 'SUPABASE_KEY'].filter(k => !process.env[k])
  if (process.env.BASE_URL && !/^https:\/\//.test(process.env.BASE_URL)) faltam.push('BASE_URL com https://')
  if (faltam.length) { console.error(`Produção sem: ${faltam.join(', ')}. Ver .env.example.`); process.exit(1) }
}
const porta = Number(process.env.PORT || 3000)
const baseUrl = (process.env.BASE_URL || `http://localhost:${porta}`).replace(/\/$/, '')

// Com SUPABASE_URL, tudo mora no Supabase e a memória é só a cópia de trabalho;
// sem, JSON em disco (desenvolvimento e testes).
const repo = process.env.SUPABASE_URL
  ? await criarRepoSupabase({ url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_KEY, diario: process.env.DADOS_DIR || join(process.cwd(), 'dados') })
  : criarRepo({ dir: process.env.DADOS_DIR || join(process.cwd(), 'dados') })

// A biblioteca mora no armazenamento (semeada dos arquivos na primeira vez) e
// é administrada pelo developer no painel. Modelo publicado que não passa no
// linter é despublicado ao subir, com aviso: a régua da publicação é a mesma.
const biblioteca = criarBibliotecaViva({ repo })
for (const m of biblioteca.publicados) {
  const r = lintModelo(m, biblioteca.indice)
  if (!r.ok) { console.warn(`[biblioteca] modelo ${m.chave} reprovado no linter e despublicado: ${r.graves.map(g => g.msg).join('; ')}`); biblioteca.despublicarModelo(m.chave) }
}
// E-mail: Resend quando há chave; em produção sem chave o servidor não sobe (ver notificacoes.js).
const transporte = transporteDoAmbiente(repo, process.env, { producao })
const notificar = transporte.enviar
const webhooks = criarWebhooks({ repo, producao })
const avisos = criarAvisos({ repo, notificar, config: { baseUrl } })
// Um acontecimento, dois ouvintes: webhook para quem integra, e-mail para quem emitiu.
const aoEvento = (org, tipo, dados) => {
  try { webhooks.emitir(org, tipo, dados) } catch (e) { console.error('[webhooks]', e) }
  avisos.aoEvento(org, tipo, dados)
}
const plataforma = criarPlataforma({ repo, notificar, config: { baseUrl } })
const carimbador = edicao.carimbo ? carimbadorDoAmbiente(process.env, { producao }) : null
// ICP-Brasil: as raízes oficiais do ITI (certs/icp-brasil). Fora de produção,
// ICP_RAIZ_TESTE acrescenta uma raiz de teste — nunca vale em produção.
const raizes = edicao.icp ? carregarRaizesOficiais() : []
if (edicao.icp && !producao && process.env.ICP_RAIZ_TESTE) raizes.push(new X509Certificate(readFileSync(process.env.ICP_RAIZ_TESTE)))
const icp = edicao.icp ? criarVerificadorIcp({ raizes }) : null
const partes = criarPartes({ repo })
const marca = criarMarca({ repo, auditar: plataforma.auditar })
const servico = criarServico({ repo, biblioteca, notificar, config: { baseUrl }, aoEvento, carimbador, icp, partes, marcaDe: marca.publica, legislacao: edicao.lei ? legislacaoPadrao() : null })
const lotes = criarLotes({ repo, biblioteca, servico })
const demonstracao = edicao.demo ? criarDemonstracao({ repo, servico, plataforma, marca, notificar, config: { baseUrl, dev: !producao } }) : null
const metricas = criarMetricas({ repo })
const exportacao = criarExportacao({ repo, servico, partes, auditar: plataforma.auditar, config: { baseUrl } })
const agenda = criarAgenda({ repo, servico, notificar, aoEvento, config: { baseUrl } })
const indices = criarIndices()

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

if (edicao.api) webhooks.iniciar()
if (edicao.agenda) agenda.iniciar() // roda agora e de hora em hora
// Carimbo que ficou pendente (ACT fora do ar) é tentado de novo a cada 10 min.
if (carimbador) setInterval(() => servico.carimbarPendentes().catch(e => console.error('[carimbo]', e)), 10 * 60e3).unref()
const contato = { whatsapp: process.env.CONTATO_WHATSAPP, email: process.env.EMAIL_RESPONDER_PARA }
const app = criarApp({ servico, lotes, plataforma, webhooks, agenda, indices, repo, biblioteca, partes, marca, demonstracao, metricas, exportacao, edicao, contato, dev: !producao, chaveDev: producao ? null : CHAVE_DEV })

// Escrita no Supabase que falhou (rede, chave) volta para a fila a cada 5 min.
if (repo.reenfileirarFalhas) setInterval(() => { const n = repo.reenfileirarFalhas(); if (n) console.log(`[supabase] tentando de novo ${n} escrita(s)`) }, 5 * 60e3).unref()

// Desligar sem perder escrita: espera a fila do Supabase esvaziar.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    if (repo.pendentes) console.log(`aguardando ${repo.pendentes} escrita(s) no Supabase…`)
    await repo.aguardar()
    process.exit(0)
  })
}

app.listen(porta, () => {
  console.log(`contratos-saas em ${baseUrl}/painel`)
  console.log(`  edição: ${edicao.nome}${edicao.nome === 'basica' ? ' (docs/BASICA.md)' : ''}`)
  console.log(`  e-mail: ${transporte.nome}`)
  console.log(`  armazenamento: ${process.env.SUPABASE_URL ? `Supabase (${process.env.SUPABASE_URL})` : `JSON em ${process.env.DADOS_DIR || join(process.cwd(), 'dados')}`}`)
  if (!producao) {
    console.log(`  logins de teste (senha "${SENHA_DEV}"): dev@contratos.local (plataforma), admin@clinica-exemplo.com.br (empresa)`)
    if (edicao.dev) console.log(`  caixa de saída e contrato avulso: ${baseUrl}/dev`)
    console.log(`  carimbo do tempo: ${carimbador ? carimbador.nome : 'desligado'}`)
    console.log(`  ICP-Brasil: ${raizes.length} raízes confiáveis${process.env.ICP_RAIZ_TESTE ? ' (inclui a raiz de TESTE)' : ''}`)
  }
})
