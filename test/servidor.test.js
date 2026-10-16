import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mascararCaminho } from '../src/servidor/app.js'
import { CHAVE, subirServidor } from './apoio-http.js'

let ambiente, base, repo, api, json, caixa
before(async () => {
  ambiente = await subirServidor()
  ;({ base, repo, api, json, caixa } = ambiente)
})
after(() => ambiente.fechar())

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
  assert.equal(mascararCaminho('/api/lote/abcDEF123/codigo'), '/api/lote/***/codigo')
})

test('lote pelo HTTP: sobe CSV cru, sugere, prévia, cria, progresso e relatório', async () => {
  const csv = ['Nome;CPF;E-mail;Cargo', 'Ana Paula Conceição;529.982.247-25;ana.paula@empresa-exemplo.com.br;Recepcionista'].join(String.fromCharCode(13, 10))
  const r = await fetch(`${base}/v1/lotes/planilha?nome=func.csv`, { method: 'POST', headers: { authorization: `Bearer ${CHAVE}`, 'content-type': 'text/csv' }, body: csv })
  assert.equal(r.status, 201)
  const { planilha_id, total } = await r.json()
  assert.equal(total, 1)
  const modelo = 'termo_confidencialidade_colaborador'
  const { corpo: sug } = await json(await api(`/v1/lotes/planilha/${planilha_id}/sugestao?modelo=${modelo}`))
  const { corpo: pre } = await json(await api('/v1/lotes/previa', { metodo: 'POST', corpo: { planilha_id, modelo, mapeamento: sug.mapeamento } }))
  assert.equal(pre.prontas, 1)
  const criado = await json(await api('/v1/lotes', { metodo: 'POST', corpo: { planilha_id, modelo, mapeamento: sug.mapeamento, nome: 'Teste HTTP', assinante_organizacao: { nome: 'Maria Exemplo Souza', email: 'maria.dir@empresa-exemplo.com.br' } } }))
  assert.equal(criado.status, 201)
  assert.equal(criado.corpo.totais.contratos, 1)
  const link = caixa('maria.dir@empresa-exemplo.com.br', 'link_lote').meta.link
  assert.equal((await fetch(link)).status, 200)
  const token = link.split('/lote/')[1]
  assert.equal((await json(await api(`/api/lote/${token}`, { chave: null }))).corpo.pendentes, 1)
  const rel = await api(`/v1/lotes/${criado.corpo.id}/relatorio.csv`)
  assert.match(rel.headers.get('content-type'), /^text\/csv/)
  assert.match(await rel.text(), /Ana Paula Conceição/)
})
