// Transporte de e-mail: Resend com fetch falso, cópia na caixa, erro que sobe,
// e a escolha pelo ambiente (produção sem chave não sobe).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarRepo } from '../src/armazenamento/repo.js'
import { htmlDe, transporteDoAmbiente, transporteResend } from '../src/notificacoes.js'

const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

test('resend: manda o e-mail com remetente, assunto, texto e html, e guarda a cópia com o id', async () => {
  const repo = criarRepo()
  const chamadas = []
  const enviar = transporteResend(repo, { apiKey: 're_teste', remetente: 'BullaCheck <contrato@bullacheck.com.br>', responderPara: 'davi@bullacheck.com.br', log: false, fetchFn: async (url, opts) => { chamadas.push({ url, opts }); return resposta(200, { id: 'em_123' }) } })
  const msg = await enviar({ para: 'joao@exemplo.com', assunto: 'Seu contrato', texto: 'Olá.\n\nAbra o link:\nhttps://bullacheck.com.br/assinar/abc\n\nAté logo.', meta: { tipo: 'link' } })
  assert.equal(chamadas.length, 1)
  assert.equal(chamadas[0].url, 'https://api.resend.com/emails')
  assert.equal(chamadas[0].opts.headers.authorization, 'Bearer re_teste')
  const corpo = JSON.parse(chamadas[0].opts.body)
  assert.deepEqual(corpo.to, ['joao@exemplo.com'])
  assert.equal(corpo.from, 'BullaCheck <contrato@bullacheck.com.br>')
  assert.equal(corpo.reply_to, 'davi@bullacheck.com.br')
  assert.equal(corpo.subject, 'Seu contrato')
  assert.match(corpo.text, /Abra o link/)
  assert.match(corpo.html, /<a href="https:\/\/bullacheck\.com\.br\/assinar\/abc"/)
  assert.equal(msg.envio.id, 'em_123')
  const caixa = repo.listar('caixa')
  assert.equal(caixa.length, 1)
  assert.equal(caixa[0].meta.tipo, 'link')
  assert.equal(caixa[0].envio.provedor, 'resend')
})

test('resend: erro do provedor sobe para quem chamou e fica registrado na caixa', async () => {
  const repo = criarRepo()
  const enviar = transporteResend(repo, { apiKey: 're_teste', remetente: 'x@y.com', log: false, fetchFn: async () => resposta(422, { message: 'Invalid `to` field' }) })
  await assert.rejects(() => enviar({ para: 'ruim', assunto: 'a', texto: 'b' }), /não saiu .*resend 422: Invalid/)
  const [m] = repo.listar('caixa')
  assert.match(m.erro, /resend 422/)
  assert.equal(m.envio, undefined)
})

test('resend: falha de rede também sobe e registra', async () => {
  const repo = criarRepo()
  const enviar = transporteResend(repo, { apiKey: 're_teste', remetente: 'x@y.com', log: false, fetchFn: async () => { throw new Error('ECONNRESET') } })
  await assert.rejects(() => enviar({ para: 'a@b.c', assunto: 'a', texto: 'b' }), /ECONNRESET/)
  assert.match(repo.listar('caixa')[0].erro, /rede: ECONNRESET/)
})

test('resend: só e-mail; outro canal não sai', async () => {
  const repo = criarRepo()
  const enviar = transporteResend(repo, { apiKey: 're_teste', remetente: 'x@y.com', log: false, fetchFn: async () => resposta(200, { id: 'x' }) })
  await assert.rejects(() => enviar({ para: '+5583999990000', canal: 'whatsapp', assunto: 'a', texto: 'b' }), /canal "whatsapp"/)
})

test('configuração exige chave e remetente', () => {
  const repo = criarRepo()
  assert.throws(() => transporteResend(repo, { remetente: 'x@y.com' }), /RESEND_API_KEY/)
  assert.throws(() => transporteResend(repo, { apiKey: 'k', remetente: 'sem-arroba' }), /EMAIL_REMETENTE/)
})

test('pelo ambiente: com chave vai de Resend; sem chave em produção não sobe, salvo EMAIL_TRANSPORTE=caixa', () => {
  const repo = criarRepo()
  assert.match(transporteDoAmbiente(repo, { RESEND_API_KEY: 'k', EMAIL_REMETENTE: 'a@b.c' }, { log: false }).nome, /^Resend/)
  assert.match(transporteDoAmbiente(repo, {}, { producao: false, log: false }).nome, /caixa/)
  assert.throws(() => transporteDoAmbiente(repo, { NODE_ENV: 'production' }, { log: false }), /RESEND_API_KEY/)
  assert.match(transporteDoAmbiente(repo, { NODE_ENV: 'production', EMAIL_TRANSPORTE: 'caixa' }, { log: false }).nome, /caixa/)
})

test('html: escapa, quebra parágrafos e deixa o link clicável', () => {
  const h = htmlDe('Olá <você>.\n\nLinha 1\nLinha 2\n\nhttps://x.y/z?a=1&b=2')
  assert.match(h, /Olá &lt;você&gt;\./)
  assert.match(h, /Linha 1<br>Linha 2/)
  assert.match(h, /<a href="https:\/\/x\.y\/z\?a=1&amp;b=2"/)
  assert.equal((h.match(/<p /g) || []).length, 3)
})
