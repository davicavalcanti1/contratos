import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { subirServidor } from './apoio-http.js'

const A = await subirServidor()
after(() => A.fechar())

test('a raiz serve o site de apresentação, com a CSP das páginas', async () => {
  const r = await fetch(`${A.base}/`, { redirect: 'manual' })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/)
  const html = await r.text()
  assert.match(html, /Contrato com bula/)
  // Sem estilo nem script inline: a CSP bloquearia.
  assert.doesNotMatch(html, /\sstyle="/)
  assert.doesNotMatch(html, /<script>/)
})

test('a demonstração do motor monta o exemplo com bula, numeração e a regra de cada cláusula', async () => {
  const r = await fetch(`${A.base}/api/demo/contrato?exemplo=pj-indeterminado`)
  assert.equal(r.status, 200)
  const d = await r.json()
  assert.equal(d.ok, true)
  assert.equal(d.contratado.tipo, 'Pessoa jurídica')
  assert.equal(d.clausulas[0].numero, 1)
  const prazo = d.clausulas.find(c => c.chave === 'prazo_indeterminado')
  assert.match(prazo.condicao, /prazo indeterminado/)
  assert.ok(!d.clausulas.some(c => c.chave === 'multa_rescisoria'), 'sem prazo não há multa por resilição antecipada')
  assert.ok(d.clausulas.every(c => typeof c.resumo === 'string' || c.resumo === null))
  assert.ok(d.clausulas.filter(c => c.critica).length >= 4)
})

test('a demonstração também mostra o exemplo recusado, com o que falta e onde resolver', async () => {
  const d = await (await fetch(`${A.base}/api/demo/contrato?exemplo=com-erros`)).json()
  assert.equal(d.ok, false)
  assert.ok(d.faltando.length > 0 && d.invalidos.length > 0)
  assert.ok(d.faltando.every(f => f.rotulo && f.motivo))
})

test('a demonstração só aceita exemplos do repositório', async () => {
  const r = await fetch(`${A.base}/api/demo/contrato?exemplo=../../etc/passwd`)
  assert.equal(r.status, 404)
})
