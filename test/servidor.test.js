import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { carregarBiblioteca } from '../src/biblioteca.js'
import { transporteCaixa } from '../src/notificacoes.js'
import { criarApp, mascararCaminho } from '../src/servidor/app.js'

let servidor, base, repo
const CHAVE = 'chave-teste'

before(async () => {
  // O serviço precisa da baseUrl real (vai nos links), que só se conhece
  // depois do listen — então o servidor sobe primeiro e o app entra depois.
  servidor = createServer()
  await new Promise(r => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${servidor.address().port}`
  const biblioteca = carregarBiblioteca()
  repo = criarRepo()
  const organizacoes = { org1: { api_key: CHAVE, dados: JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8')) } }
  const servico = criarServico({ repo, biblioteca, notificar: transporteCaixa(repo, { log: false }), config: { baseUrl: base } })
  servidor.on('request', criarApp({ servico, repo, biblioteca, organizacoes, dev: true, log: false }))
})
after(() => servidor.close())

const api = (caminho, { metodo = 'GET', corpo, chave = CHAVE, sessao } = {}) =>
  fetch(base + caminho, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(chave ? { authorization: `Bearer ${chave}` } : {}),
      ...(sessao ? { 'x-sessao': sessao } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
const json = async (r) => ({ status: r.status, corpo: await r.json() })
const caixa = (para, tipo) => repo.listar('caixa', m => m.para === para && m.meta.tipo === tipo).at(-1)

test('API da organização exige chave', async () => {
  assert.equal((await api('/v1/modelos', { chave: 'errada' })).status, 401)
  const { status, corpo } = await json(await api('/v1/modelos'))
  assert.equal(status, 200)
  assert.equal(corpo[0].chave, 'prestacao_servicos')
})

test('lacuna volta 422 com o que falta', async () => {
  const { modelo, dados } = JSON.parse(readFileSync('exemplos/com-erros.json', 'utf8'))
  const { status, corpo } = await json(await api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  assert.equal(status, 422)
  assert.ok(corpo.detalhes.faltando.length && corpo.detalhes.invalidos.length)
})

test('ponta a ponta pelo HTTP: gerar, enviar, assinar, selar, verificar', async () => {
  const { modelo, dados } = JSON.parse(readFileSync('exemplos/mei-unica.json', 'utf8'))
  const gerado = await json(await api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  assert.equal(gerado.status, 201)
  const id = gerado.corpo.id

  const email = 'ana@design-exemplo.com.br'
  const env = await json(await api(`/v1/contratos/${id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'Ana Exemplo Design', email }] } }))
  assert.equal(env.status, 200)
  const link = caixa(email, 'link').meta.link
  const token = link.split('/assinar/')[1]

  // A página do link responde com os cabeçalhos que protegem o token.
  const pagina = await fetch(link)
  assert.equal(pagina.status, 200)
  assert.equal(pagina.headers.get('referrer-policy'), 'no-referrer')
  assert.match(pagina.headers.get('content-security-policy'), /frame-ancestors 'none'/)

  const s = `/api/assinar/${token}`
  assert.equal((await json(await api(s, { chave: null }))).corpo.signatario.nome, 'Ana Exemplo Design')
  assert.equal((await api(`${s}/conteudo`, { chave: null })).status, 401)
  assert.equal((await api(`${s}/codigo`, { metodo: 'POST', chave: null })).status, 200)
  const { corpo: { sessao } } = await json(await api(`${s}/codigo/validar`, { metodo: 'POST', chave: null, corpo: { codigo: caixa(email, 'codigo').meta.codigo } }))
  const { corpo: cont } = await json(await api(`${s}/conteudo`, { chave: null, sessao }))
  for (const cl of cont.clausulas.filter(c => c.critica)) {
    assert.equal((await api(`${s}/ciencia`, { metodo: 'POST', chave: null, sessao, corpo: { clausula: cl.chave, tempo_leitura_ms: 5000 } })).status, 200)
  }
  await api(`${s}/leitura`, { metodo: 'POST', chave: null, sessao, corpo: { tempos: {} } })
  const ass = await json(await api(`${s}/assinar`, { metodo: 'POST', chave: null, sessao, corpo: { nome_digitado: 'Ana Exemplo Design', concordo: true, geo: { lat: -7.12, lng: -34.86, precisao_m: 30 } } }))
  assert.equal(ass.corpo.contrato_status, 'assinado')

  // Selo público
  const { corpo: consulta } = await json(await api(`/v1/contratos/${id}`))
  const v = await json(await api(`/api/verificar/${consulta.codigo_verificacao}`, { chave: null }))
  assert.equal(v.status, 200)
  assert.equal(v.corpo.signatarios[0].nome, 'Ana E. D.')

  // O PDF baixado pelo signatário confere com o selo.
  const pdf = Buffer.from(await (await api(`${s}/arquivo?qual=final`, { chave: null, sessao })).arrayBuffer())
  const hash = createHash('sha256').update(pdf).digest('hex')
  assert.equal((await json(await api(`/api/verificar/${consulta.codigo_verificacao}/conferir`, { metodo: 'POST', chave: null, corpo: { sha256: hash } }))).corpo.confere, 'final')

  // Dossiê nos dois formatos.
  const dossie = await json(await api(`/v1/contratos/${id}/dossie`))
  assert.ok(dossie.corpo.integridade.trilha.integra)
  assert.equal(dossie.corpo.signatarios[0].evidencias.geo.lat, -7.12)
  const dpdf = await api(`/v1/contratos/${id}/dossie?formato=pdf`)
  assert.equal(dpdf.headers.get('content-type'), 'application/pdf')
})

test('código inexistente no selo é 404, e o token não vai para o log', async () => {
  assert.equal((await api('/api/verificar/AAAA-BBBB-CCCC', { chave: null })).status, 404)
  assert.equal(mascararCaminho('/api/assinar/abcDEF123_-x/conteudo'), '/api/assinar/***/conteudo')
  assert.equal(mascararCaminho('/assinar/abcDEF123'), '/assinar/***')
})
