import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { lintModelo } from '../src/motor/linter.js'
import { indexarBiblioteca } from '../src/motor/montar.js'

const bib = carregarBiblioteca()
const base = acharModelo(bib, 'prestacao_servicos')
const clone = (x) => structuredClone(x)
const lint = (modelo, clausulas = bib.clausulas) => lintModelo(modelo, indexarBiblioteca(clausulas))

test('os modelos publicados passam no linter', () => {
  for (const m of bib.modelos) {
    const r = lint(m)
    assert.ok(r.ok, JSON.stringify(r.graves, null, 2))
  }
})

test('sem foro é grave', () => {
  const m = clone(base)
  m.blocos = m.blocos.filter(b => b.clausula !== 'foro')
  assert.ok(lint(m).graves.some(g => /"foro"/.test(g.msg)))
})

test('pega a combinação que fica sem prazo, e diz qual', () => {
  const m = clone(base)
  m.blocos = m.blocos.filter(b => b.clausula !== 'prazo_indeterminado')
  const g = lint(m).graves.find(x => /"prazo"/.test(x.msg))
  assert.ok(g)
  assert.match(g.msg, /contrato\.prazo_tipo=indeterminado/)
})

test('duas cláusulas de prazo ao mesmo tempo é grave', () => {
  const m = clone(base)
  delete m.blocos.find(b => b.clausula === 'prazo_indeterminado').quando
  assert.ok(lint(m).graves.some(g => /duas cláusulas de "prazo"/.test(g.msg)))
})

test('sem a cláusula de assinatura eletrônica cita a MP 2.200-2', () => {
  const m = clone(base)
  m.blocos = m.blocos.filter(b => b.clausula !== 'assinatura_eletronica')
  m.fecho = 'E, por estarem de acordo, assinam.'
  assert.ok(lint(m).graves.some(g => /2\.200-2/.test(g.msg)))
})

test('cláusula crítica sem resumo, placeholder sem origem e colchetes', () => {
  const cl = clone(bib.clausulas)
  const multa = cl.find(c => c.chave === 'multa_rescisoria')
  delete multa.resumo_simples
  multa.paragrafos.push('Multa em favor de [nome do beneficiário], acrescida de {{contrato.inexistente}}.')
  const msgs = lint(base, cl).graves.map(g => g.msg).join('\n')
  assert.match(msgs, /crítica sem resumo/)
  assert.match(msgs, /\{\{contrato\.inexistente\}\}/)
  assert.match(msgs, /colchetes/)
})

test('regra com operador desconhecido é grave', () => {
  const m = clone(base)
  m.blocos[0].quando = { campo: 'contratado.tipo', op: 'parece', valor: 'pf' }
  assert.ok(lint(m).graves.some(g => /operador desconhecido/.test(g.msg)))
})
