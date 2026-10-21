// "Tenho uma dúvida" na cláusula: o signatário pergunta, a organização é
// avisada e responde, a resposta volta por e-mail e na tela, tudo na trilha
// e no dossiê. Perguntar não trava a assinatura.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SENHA, subirServidor } from './apoio-http.js'

let A, admin, c, token, sessao
const ADMIN = 'admin@org1.exemplo'
const EMAIL = 'joao@prestador.exemplo'
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))
const pub = async (caminho, corpo) => A.json(await A.api(`/api/assinar/${token}${caminho}`, { chave: null, metodo: corpo ? 'POST' : 'GET', corpo, sessao }))
const painel = async (caminho, o = {}) => A.json(await A.api(`/painel/api${caminho}`, { chave: null, cookie: admin, ...o }))

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Maria Admin Souza', email: ADMIN, papel: 'org_admin', senha: SENHA })
  admin = await A.entrar(ADMIN)
  const { modelo, dados } = exemplo('pf-determinado')
  c = (await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))).corpo
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: EMAIL }] } })
  token = A.caixa(EMAIL, 'link').meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(token, {})
  ;({ sessao } = A.servico.validarCodigo(token, A.caixa(EMAIL, 'codigo').meta.codigo, {}))
})
after(() => A.fechar())

test('o signatário pergunta numa cláusula: entra na trilha, a organização recebe e-mail, o painel vê a dúvida aberta', async () => {
  let r = await pub('/duvida', { clausula: 'multa_rescisoria', pergunta: 'A multa vale se eu precisar sair por doença?' })
  assert.equal(r.status, 201, JSON.stringify(r.corpo))
  assert.equal(r.corpo.numero, 11)
  assert.equal(r.corpo.resposta, null)
  assert.equal((await pub('/duvida', { clausula: 'objeto', pergunta: 'Visita semanal em qual dia?' })).status, 201, 'cláusula comum também aceita dúvida')
  assert.equal((await pub('/duvida', { clausula: 'nao_existe', pergunta: 'x?' })).status, 404)
  assert.equal((await pub('/duvida', { clausula: 'foro', pergunta: 'ok' })).status, 400, 'curta demais')

  const trilha = A.servico.trilha.listar(c.id).filter(e => e.tipo === 'clausula.duvida')
  assert.equal(trilha.length, 2)
  assert.equal(trilha[0].dados.pergunta, 'A multa vale se eu precisar sair por doença?')

  await A.avisos.aguardar()
  const avisos = A.repo.listar('caixa', m => m.para === ADMIN && m.meta.tipo === 'aviso.signatario.duvida')
  assert.equal(avisos.length, 2, 'quem administra é avisado de cada dúvida')
  const aviso = avisos[0]
  assert.match(aviso.assunto, /^Dúvida de João na cláusula 11:/)
  assert.match(aviso.texto, /"A multa vale se eu precisar sair por doença\?"/)
  assert.match(aviso.texto, new RegExp(`/painel/contratos/${c.id}#duvidas`))
  assert.ok(A.webhooks.emitir('org1', 'signatario.duvida', {}) !== undefined, 'o tipo existe para webhooks')

  const det = (await painel(`/org/contratos/${c.id}`)).corpo
  assert.equal(det.duvidas.length, 2)
  assert.equal(det.duvidas[0].signatario_nome, 'João da Silva Exemplo')
  const lista = (await painel('/org/contratos?status=enviado')).corpo
  assert.equal(lista.itens.find(x => x.id === c.id).duvidas_abertas, 2)

  const conteudo = (await pub('/conteudo')).corpo
  assert.equal(conteudo.clausulas.find(x => x.chave === 'multa_rescisoria').duvidas.length, 1)
})

test('a organização responde: trilha, e-mail ao signatário sem link novo (está lendo), resposta na tela; não se responde duas vezes', async () => {
  const det = (await painel(`/org/contratos/${c.id}`)).corpo
  const d = det.duvidas[0]
  let r = await painel(`/org/contratos/${c.id}/duvidas/${d.id}/responder`, { metodo: 'POST', corpo: { resposta: 'Não. Doença comprovada é justa causa para encerrar sem multa (cláusula 10.1).' } })
  assert.equal(r.status, 200, JSON.stringify(r.corpo))
  assert.equal(r.corpo.respondida_por, 'Maria Admin Souza')
  assert.equal((await painel(`/org/contratos/${c.id}/duvidas/${d.id}/responder`, { metodo: 'POST', corpo: { resposta: 'de novo' } })).status, 409)
  assert.equal((await painel(`/org/contratos/${c.id}/duvidas/nao-existe/responder`, { metodo: 'POST', corpo: { resposta: 'x' } })).status, 404)

  const ev = A.servico.trilha.listar(c.id).filter(e => e.tipo === 'clausula.resposta')
  assert.equal(ev.length, 1)
  assert.match(ev[0].ator, /^usuario:/)
  const email = A.caixa(EMAIL, 'resposta')
  assert.match(email.assunto, /^Resposta à sua dúvida:/)
  assert.match(email.texto, /Maria Admin Souza/)
  assert.equal(email.meta.link, null, 'confirmou o código há pouco: a tela está aberta, sem link novo')
  assert.equal(A.servico.abrir(token, {}).signatario.status, 'identificado', 'o link continua válido')

  const conteudo = (await pub('/conteudo')).corpo
  const cl = conteudo.clausulas.find(x => x.chave === 'multa_rescisoria')
  assert.match(cl.duvidas[0].resposta, /justa causa/)
  assert.equal(cl.duvidas[0].respondida_por, 'Maria Admin Souza')
})

test('a dúvida aberta não trava: a pessoa assina; pergunta e resposta ficam no dossiê (JSON e PDF)', async () => {
  const conteudo = (await pub('/conteudo')).corpo
  for (const cl of conteudo.clausulas.filter(x => x.critica)) await pub('/ciencia', { clausula: cl.chave })
  await pub('/leitura', {})
  const r = await pub('/assinar', { nome_digitado: 'João da Silva Exemplo', concordo: true })
  assert.equal(r.status, 200, JSON.stringify(r.corpo))
  assert.equal(r.corpo.contrato_status, 'assinado')
  const dossie = (await A.json(await A.api(`/v1/contratos/${c.id}/dossie`))).corpo
  assert.equal(dossie.duvidas.length, 2)
  assert.equal(dossie.duvidas.filter(d => !d.resposta).length, 1, 'uma ficou sem resposta, e o dossiê diz')
  const pdf = await A.api(`/v1/contratos/${c.id}/dossie?formato=pdf`)
  assert.equal(pdf.status, 200)
  assert.ok((await pdf.arrayBuffer()).byteLength > 50_000)
  assert.equal((await pub('/duvida', { clausula: 'foro', pergunta: 'Depois de assinar?' })).status, 409, 'assinado, não pergunta mais')
})

test('quem já saiu da tela recebe a resposta com link novo', async () => {
  const { modelo, dados } = exemplo('pf-determinado')
  const c2 = (await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))).corpo
  await A.api(`/v1/contratos/${c2.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'Ana Souza Lima', email: 'ana@prestador.exemplo' }] } })
  const t2 = A.caixa('ana@prestador.exemplo', 'link').meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(t2, {})
  const { sessao: s2 } = A.servico.validarCodigo(t2, A.caixa('ana@prestador.exemplo', 'codigo').meta.codigo, {})
  A.servico.perguntar(t2, s2, { clausula: 'foro', pergunta: 'Posso escolher outro foro?' }, {})
  // Simula que a identificação foi há 3 horas.
  const sig = A.repo.listar('signatarios', x => x.contrato_id === c2.id)[0]
  A.repo.atualizar('signatarios', sig.id, { identificado_em: new Date(Date.now() - 3 * 3600e3).toISOString() })
  const d = A.servico.duvidasDe(c2.id)[0]
  await A.servico.responder(c2.id, 'org1', d.id, { resposta: 'O foro é o da sede; pode negociar antes de assinar.' }, { id: 'u1', nome: 'Maria', tipo: 'usuario' }, {})
  const email = A.caixa('ana@prestador.exemplo', 'resposta')
  assert.match(email.meta.link, /\/assinar\//)
  assert.throws(() => A.servico.abrir(t2, {}), /substituído/, 'o link antigo deixou de valer')
  assert.equal(A.servico.abrir(email.meta.link.split('/assinar/')[1], {}).signatario.nome, 'Ana Souza Lima')
})
