import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIPOS, cpfValido, cnpjValido, reaisPorExtenso, lerData } from '../src/motor/tipos.js'

test('CPF e CNPJ: dígito verificador', () => {
  assert.ok(cpfValido('529.982.247-25'))
  assert.ok(!cpfValido('529.982.247-26'))
  assert.ok(!cpfValido('111.111.111-11'))
  assert.ok(cnpjValido('11.222.333/0001-81'))
  assert.ok(!cnpjValido('11.222.333/0001-82'))
})

test('valor por extenso', () => {
  assert.equal(reaisPorExtenso(1500), 'mil e quinhentos reais')
  assert.equal(reaisPorExtenso(2350.5), 'dois mil trezentos e cinquenta reais e cinquenta centavos')
  assert.equal(reaisPorExtenso(100), 'cem reais')
  assert.equal(reaisPorExtenso(1), 'um real')
  assert.equal(reaisPorExtenso(0.01), 'um centavo')
  assert.equal(reaisPorExtenso(2000000), 'dois milhões de reais')
  assert.equal(reaisPorExtenso(1001000), 'um milhão e mil reais')
})

test('moeda sai com número e extenso; aceita "1.500,00"', () => {
  assert.equal(TIPOS.moeda.formatar('1.500,00', {}), 'R$ 1.500,00 (mil e quinhentos reais)')
  assert.equal(TIPOS.moeda.formatar(1500, {}, 'numero'), 'R$ 1.500,00')
})

test('data: rejeita 31/02 e aceita os dois formatos', () => {
  assert.equal(lerData('31/02/2026'), null)
  assert.equal(TIPOS.data.formatar('2026-11-01', {}), '01/11/2026')
  assert.equal(TIPOS.data.formatar('01/11/2026', {}, 'extenso'), '1 de novembro de 2026')
})

test('enum aparece pelo rótulo, não pela chave', () => {
  const def = { opcoes: [{ valor: 'pf', texto: 'pessoa física' }] }
  assert.equal(TIPOS.enum.formatar('pf', def), 'pessoa física')
  assert.ok(TIPOS.enum.validar('xx', def))
})
