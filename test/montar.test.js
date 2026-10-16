import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { montarContrato } from '../src/motor/montar.js'

const bib = carregarBiblioteca()
const modelo = acharModelo(bib, 'prestacao_servicos')
const org = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const exemplo = (n) => ({ organizacao: org, ...JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8')).dados })
const montar = (dados, agora) => montarContrato({ modelo, biblioteca: bib.indice, dados, agora })
const texto = (c) => c.clausulas.flatMap(x => x.paragrafos.map(p => p.texto)).join('\n')

test('PF: qualificação de pessoa física, sem a de PJ', () => {
  const r = montar(exemplo('pf-determinado'))
  assert.ok(r.ok, JSON.stringify([r.faltando, r.invalidos]))
  const t = texto(r.contrato)
  assert.match(t, /CPF sob o nº 529\.982\.247-25/)
  assert.doesNotMatch(t, /neste ato representada por Carlos/)
  assert.match(t, /art\. 442-B/)
})

test('PJ: sem cláusula de autônomo (442-B) e com representante', () => {
  const r = montar(exemplo('pj-indeterminado'))
  assert.ok(r.ok)
  const t = texto(r.contrato)
  assert.match(t, /representada por Carlos Exemplo/)
  assert.doesNotMatch(t, /442-B/)
})

test('prazo indeterminado: sem multa rescisória, e a numeração não tem buraco', () => {
  const r = montar(exemplo('pj-indeterminado'))
  const chaves = r.contrato.clausulas.map(c => c.chave)
  assert.ok(!chaves.includes('multa_rescisoria'))
  assert.ok(!chaves.includes('prazo_determinado'))
  assert.deepEqual(r.contrato.clausulas.map(c => c.numero), chaves.map((_, i) => i + 1))
})

test('referência cruzada aponta para o número final da cláusula', () => {
  const r = montar(exemplo('pf-determinado'))
  const multa = r.contrato.clausulas.find(c => c.chave === 'multa_rescisoria').numero
  assert.match(texto(r.contrato), new RegExp(`multa prevista na cláusula ${multa}\\.`))
})

test('reajuste anual só entra em contrato de 12 meses ou mais', () => {
  assert.match(texto(montar(exemplo('pf-determinado')).contrato), /reajustado a cada 12/)
  assert.doesNotMatch(texto(montar(exemplo('mei-unica')).contrato), /reajustado/)
})

test('CPF só é exigido de quem é PF/MEI', () => {
  const d = exemplo('pf-determinado')
  delete d.contratado.cpf
  const r = montar(d)
  assert.ok(!r.ok)
  assert.ok(r.faltando.some(f => f.variavel === 'contratado.cpf'))
  const pj = exemplo('pj-indeterminado')
  assert.ok(!pj.contratado.cpf && montar(pj).ok)
})

test('dado inválido bloqueia e diz qual', () => {
  const d = exemplo('pf-determinado')
  d.contratado.cpf = '123.456.789-00'
  const r = montar(d)
  assert.ok(!r.ok)
  assert.deepEqual(r.invalidos.map(i => i.variavel), ['contratado.cpf'])
})

test('campo que decide regra, ausente, é falta', () => {
  const d = exemplo('pf-determinado')
  delete d.contratado.tipo
  const r = montar(d)
  assert.ok(r.faltando.some(f => f.variavel === 'contratado.tipo' && /decide/.test(f.motivo)))
})

test('padrões do modelo preenchem o que a organização não definiu', () => {
  const t = texto(montar(exemplo('pf-determinado')).contrato)
  assert.match(t, /multa de 20%/)
  assert.match(t, /até o dia 10 do mês/)
})

test('hash do conteúdo: estável entre gerações, muda se o texto muda', () => {
  const a = montar(exemplo('pf-determinado'), new Date('2026-10-16T10:00:00Z'))
  const b = montar(exemplo('pf-determinado'), new Date('2026-10-16T15:00:00Z'))
  assert.equal(a.contrato.conteudo_sha256, b.contrato.conteudo_sha256)
  const d = exemplo('pf-determinado')
  d.contrato.valor = 2351
  assert.notEqual(montar(d, new Date('2026-10-16T10:00:00Z')).contrato.conteudo_sha256, a.contrato.conteudo_sha256)
})

test('cláusulas críticas carregam a bula preenchida', () => {
  const multa = montar(exemplo('mei-unica')).contrato.clausulas.find(c => c.chave === 'multa_rescisoria')
  assert.ok(multa.critica)
  assert.match(multa.resumo, /multa de 10%/)
})
