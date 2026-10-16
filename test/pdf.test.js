import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { montarContrato } from '../src/motor/montar.js'
import { gerarPdf } from '../src/motor/pdf.js'

test('gera PDF e devolve o SHA-256 do arquivo', async () => {
  const bib = carregarBiblioteca()
  const org = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
  const { dados } = JSON.parse(readFileSync('exemplos/pj-indeterminado.json', 'utf8'))
  const r = montarContrato({ modelo: acharModelo(bib, 'prestacao_servicos'), biblioteca: bib.indice, dados: { organizacao: org, ...dados } })
  const { buffer, sha256 } = await gerarPdf(r.contrato)
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-')
  assert.match(sha256, /^[0-9a-f]{64}$/)
})
