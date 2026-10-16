import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { subirServidor } from './apoio-http.js'

const A = await subirServidor()
after(() => A.fechar())

test('a raiz serve o site de apresentação, com a CSP das páginas', async () => {
  const r = await fetch(`${A.base}/`, { redirect: 'manual' })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/)
  assert.match(await r.text(), /Contrato com bula/)
})
