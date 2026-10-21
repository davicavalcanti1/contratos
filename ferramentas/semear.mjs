// Cria contratos de teste na organização de exemplo do servidor local:
// um assinado, dois aguardando, um recusado e um só gerado.
// uso: node semear.mjs [http://localhost:3100]
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.argv[2] || 'http://localhost:3100'
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const estado = await (await fetch(`${base}/dev/api/estado`)).json()
const chave = estado.organizacao.api_key

const v1 = async (caminho, corpo, metodo = corpo ? 'POST' : 'GET') => {
  const r = await fetch(`${base}/v1${caminho}`, { method: metodo, headers: { authorization: `Bearer ${chave}`, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  const j = await r.json()
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${JSON.stringify(j)}`)
  return j
}
const pub = async (caminho, corpo, sessao) => {
  const r = await fetch(`${base}/api/assinar/${caminho}`, { method: corpo ? 'POST' : 'GET', headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...(sessao ? { 'x-sessao': sessao } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  const j = await r.json()
  if (!r.ok) throw new Error(`assinar ${caminho}: ${r.status} ${JSON.stringify(j)}`)
  return j
}
const exemplo = (n) => JSON.parse(readFileSync(`${REPO}/exemplos/${n}.json`, 'utf8'))
const caixa = async (para, tipo) => {
  const e = await (await fetch(`${base}/dev/api/estado`)).json()
  return e.caixa.filter(m => m.para === para && m.meta?.tipo === tipo).sort((a, b) => b.em.localeCompare(a.em))[0]
}

async function criar(nome, referencia, extra = {}) {
  const ex = exemplo(nome)
  const dados = structuredClone(ex.dados)
  Object.assign(dados.contratado, extra)
  const c = await v1('/contratos', { modelo: ex.modelo, dados, referencia })
  return { c, dados }
}
async function enviar(c, dados) {
  const s = { nome: dados.contratado.representante_nome || dados.contratado.nome, email: dados.contratado.email, cpf: dados.contratado.representante_cpf || dados.contratado.cpf }
  await v1(`/contratos/${c.id}/enviar`, { signatarios: [s], prazo_dias: 7 })
  return s
}
async function assinarTudo(s) {
  const link = (await caixa(s.email, 'link')).meta.link
  const token = link.split('/assinar/')[1]
  await pub(`${token}/codigo`, {})
  const codigo = (await caixa(s.email, 'codigo')).meta.codigo
  const { sessao } = await pub(`${token}/codigo/validar`, { codigo })
  const conteudo = await pub(`${token}/conteudo`, null, sessao)
  for (const cl of conteudo.clausulas.filter(x => x.critica)) await pub(`${token}/ciencia`, { clausula: cl.chave }, sessao)
  await pub(`${token}/leitura`, {}, sessao)
  return pub(`${token}/assinar`, { nome_digitado: s.nome, concordo: true }, sessao)
}
async function recusar(s) {
  const token = (await caixa(s.email, 'link')).meta.link.split('/assinar/')[1]
  await pub(`${token}/codigo`, {})
  const codigo = (await caixa(s.email, 'codigo')).meta.codigo
  const { sessao } = await pub(`${token}/codigo/validar`, { codigo })
  return pub(`${token}/recusar`, { motivo: 'O valor combinado foi outro.' }, sessao)
}

// 1. assinado
{ const { c, dados } = await criar('pf-determinado', 'TI-2026-014'); const s = await enviar(c, dados); await assinarTudo(s); console.log('assinado:', c.id) }
// 2. aguardando (PJ)
{ const { c, dados } = await criar('pj-indeterminado', 'LIMP-2026-003'); await enviar(c, dados); console.log('aguardando:', c.id) }
// 3. aguardando (MEI)
{ const { c, dados } = await criar('mei-unica', 'MKT-2026-021'); await enviar(c, dados); console.log('aguardando:', c.id) }
// 4. recusado
{ const { c, dados } = await criar('pf-determinado', 'TI-2026-015', { nome: 'Carla Menezes Exemplo', email: 'carla.exemplo@exemplo.com' }); const s = await enviar(c, dados); await recusar(s); console.log('recusado:', c.id) }
// 5. só gerado
{ const { c } = await criar('mei-unica', 'MKT-2026-022', { nome: 'Bruno Lima Design', email: 'bruno@exemplo.com' }); console.log('gerado:', c.id) }
console.log('ok')
