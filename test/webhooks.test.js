import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarRepo } from '../src/armazenamento/repo.js'
import { assinar, criarWebhooks, ipPrivado } from '../src/plataforma/webhooks.js'

function ambiente({ producao = false, respostas = [], resolver } = {}) {
  let t = new Date('2026-10-16T15:00:00Z').getTime()
  const relogio = { agora: () => new Date(t), avancar: (s) => { t += s * 1000 } }
  const repo = criarRepo()
  const chamadas = []
  const fetchFn = async (url, opts) => {
    chamadas.push({ url, ...opts })
    const r = respostas.shift() ?? 200
    if (r instanceof Error) throw r
    return new Response('resposta', { status: r })
  }
  const w = criarWebhooks({ repo, producao, agora: relogio.agora, fetchFn, resolver, log: false })
  return { repo, w, relogio, chamadas }
}

test('entrega assinada com HMAC que o cliente consegue conferir', async () => {
  const { w, chamadas } = ambiente()
  const hook = await w.criar('org1', { url: 'https://cliente.exemplo/webhook', eventos: ['contrato.assinado'] })
  assert.match(hook.segredo, /^whsec_/)
  w.emitir('org1', 'contrato.assinado', { contrato: { id: 'c1' } })
  w.emitir('org1', 'contrato.recusado', { contrato: { id: 'c2' } }) // não assinado neste webhook
  await w.processar()
  assert.equal(chamadas.length, 1)
  const h = chamadas[0].headers
  const [, t, v1] = h['x-contratos-assinatura'].match(/^t=(\d+),v1=([0-9a-f]{64})$/)
  assert.equal(v1, assinar(hook.segredo, t, chamadas[0].body), 'o lado de lá recalcula e confere')
  assert.equal(h['x-contratos-evento'], 'contrato.assinado')
  assert.equal(JSON.parse(chamadas[0].body).dados.contrato.id, 'c1')
  assert.equal(chamadas[0].redirect, 'manual')
})

test('falha tenta de novo em 1 min, 5 min, 30 min, 2 h, 6 h e então desiste', async () => {
  const { w, relogio, chamadas, repo } = ambiente({ respostas: [500, 500, 500, 500, 500, 500] })
  await w.criar('org1', { url: 'https://cliente.exemplo/w', eventos: ['contrato.assinado'] })
  w.emitir('org1', 'contrato.assinado', {})
  await w.processar()
  for (const espera of [60, 300, 1800, 7200, 21600]) {
    relogio.avancar(espera - 1)
    await w.processar()
    const antes = chamadas.length
    relogio.avancar(1)
    await w.processar()
    assert.equal(chamadas.length, antes + 1, `nova tentativa depois de ${espera}s`)
  }
  const e = repo.listar('entregas')[0]
  assert.equal(e.status, 'falhou')
  assert.equal(e.tentativas, 6)
  assert.equal(new Set(chamadas.map(c => c.headers['x-contratos-entrega'])).size, 1, 'mesmo id de entrega em toda tentativa')
  w.reenviar('org1', e.id)
  await w.processar()
  assert.equal(repo.obter('entregas', e.id).status, 'entregue')
})

test('timeout ou erro de rede contam como falha, não derrubam nada', async () => {
  const { w, repo } = ambiente({ respostas: [new Error('ECONNREFUSED')] })
  await w.criar('org1', { url: 'https://cliente.exemplo/w', eventos: ['contrato.assinado'] })
  w.emitir('org1', 'contrato.assinado', {})
  await w.processar()
  const e = repo.listar('entregas')[0]
  assert.equal(e.status, 'pendente')
  assert.match(e.historico[0].resposta, /ECONNREFUSED/)
})

test('SSRF: em produção recusa http, localhost, IP interno e domínio que resolve para dentro', async () => {
  const { w } = ambiente({ producao: true, resolver: async (h) => (h === 'interno.exemplo' ? [{ address: '10.0.0.5' }] : [{ address: '93.184.216.34' }]) })
  await assert.rejects(w.criar('o', { url: 'http://cliente.exemplo/w', eventos: ['contrato.assinado'] }), /https/)
  await assert.rejects(w.criar('o', { url: 'https://localhost/w', eventos: ['contrato.assinado'] }), /rede interna/)
  await assert.rejects(w.criar('o', { url: 'https://192.168.0.10/w', eventos: ['contrato.assinado'] }), /rede interna/)
  await assert.rejects(w.criar('o', { url: 'https://interno.exemplo/w', eventos: ['contrato.assinado'] }), /rede interna/)
  await assert.rejects(w.criar('o', { url: 'https://user:pass@cliente.exemplo/w', eventos: ['contrato.assinado'] }), /segredo/)
  assert.ok(await w.criar('o', { url: 'https://cliente.exemplo/w', eventos: ['contrato.assinado'] }))
})

test('ipPrivado cobre v4, v6 e v4 mapeado em v6', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.ok(ipPrivado(ip), ip)
  for (const ip of ['8.8.8.8', '172.32.0.1', '2001:4860::8888']) assert.ok(!ipPrivado(ip), ip)
})

test('evento desconhecido e lista vazia são recusados; webhook de outra org não é visível', async () => {
  const { w } = ambiente()
  await assert.rejects(w.criar('org1', { url: 'https://x.exemplo', eventos: [] }), /ao menos um/)
  await assert.rejects(w.criar('org1', { url: 'https://x.exemplo', eventos: ['contrato.inventado'] }), /desconhecido/)
  const h = await w.criar('org1', { url: 'https://x.exemplo', eventos: ['contrato.assinado'] })
  assert.throws(() => w.segredo('org2', h.id), e => e.status === 404)
  assert.equal(w.listar('org2').length, 0)
})
