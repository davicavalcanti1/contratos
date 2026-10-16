import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { montarContrato } from '../src/motor/montar.js'
import { gerarPdf } from '../src/motor/pdf.js'
import { carregarRaizesOficiais, criarVerificadorIcp, localizarAssinatura } from '../src/plugaveis/icp.js'
import { assinarPdf, criarIcpDeTeste } from './apoio-icp.js'

const bib = carregarBiblioteca()
const org = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const { modelo, dados } = JSON.parse(readFileSync('exemplos/pf-determinado.json', 'utf8'))
const r = montarContrato({ modelo: acharModelo(bib, modelo), biblioteca: bib.indice, dados: { ...dados, organizacao: org } })
const ORIGINAL = (await gerarPdf(r.contrato)).buffer
const icp = await criarIcpDeTeste()
const verificador = criarVerificadorIcp({ raizes: [icp.raizX509] })

test('as raízes oficiais da ICP-Brasil (ITI) estão no repositório e são lidas', () => {
  const raizes = carregarRaizesOficiais()
  assert.equal(raizes.length, 4)
  assert.ok(raizes.every(x => /O=ICP-Brasil/.test(x.subject) && /Autoridade Certificadora Raiz Brasileira/.test(x.subject)))
})

test('PDF assinado corretamente: válido, contém o original, cadeia até a raiz, CPF do titular', async () => {
  const assinado = await assinarPdf(ORIGINAL, icp)
  const v = await verificador.verificar(assinado, { original: ORIGINAL })
  assert.deepEqual(v.motivos, [])
  assert.equal(v.valida, true)
  assert.equal(v.contem_original, true)
  assert.equal(v.icp_brasil, true, 'raiz confiável por injeção, no teste')
  assert.equal(v.certificado.cpf, '52998224725')
  assert.equal(v.certificado.nome, 'JOAO DA SILVA EXEMPLO:52998224725')
  assert.deepEqual(v.cadeia, ['JOAO DA SILVA EXEMPLO:52998224725', 'AC Intermediaria de Teste', 'Autoridade Certificadora Raiz de Teste'])
  assert.match(v.revogacao, /validar\.iti\.gov\.br/)
})

test('com as raízes oficiais, um certificado de fora da ICP-Brasil não passa', async () => {
  const assinado = await assinarPdf(ORIGINAL, icp)
  const v = await criarVerificadorIcp().verificar(assinado, { original: ORIGINAL })
  assert.equal(v.criptografia_ok, true, 'a assinatura em si confere')
  assert.equal(v.icp_brasil, false)
  assert.equal(v.valida, false)
  assert.ok(v.motivos.some(m => /raiz da ICP-Brasil/.test(m)))
})

test('assinar OUTRO documento (ou o contrato editado) é recusado', async () => {
  const outro = Buffer.from(ORIGINAL)
  outro[200] ^= 1
  const assinado = await assinarPdf(outro, icp)
  const v = await verificador.verificar(assinado, { original: ORIGINAL })
  assert.equal(v.contem_original, false)
  assert.equal(v.valida, false)
  assert.ok(v.motivos.some(m => /não é o contrato enviado/.test(m)))
})

test('mexer no arquivo depois de assinado é detectado', async () => {
  const assinado = await assinarPdf(ORIGINAL, icp)
  // 1. alterar um byte coberto pela assinatura
  const alterado = Buffer.from(assinado)
  alterado[500] ^= 1
  const v1 = await verificador.verificar(alterado, { original: ORIGINAL })
  assert.equal(v1.valida, false)
  // 2. acrescentar conteúdo depois da assinatura
  const acrescido = Buffer.concat([assinado, Buffer.from('\n% acrescentado depois\n')])
  const v2 = await verificador.verificar(acrescido, { original: ORIGINAL })
  assert.equal(v2.cobre_arquivo_inteiro, false)
  assert.equal(v2.valida, false)
})

test('certificado vencido no momento da assinatura é recusado', async () => {
  const velho = await criarIcpDeTeste({ validadeTitular: { de: new Date('2020-01-01'), ate: new Date('2021-01-01') } })
  const assinado = await assinarPdf(ORIGINAL, velho)
  const v = await criarVerificadorIcp({ raizes: [velho.raizX509] }).verificar(assinado, { original: ORIGINAL })
  assert.ok(v.motivos.some(m => /não estava válido/.test(m)))
})

test('PDF sem assinatura e assinatura corrompida dão motivo claro', async () => {
  assert.match((await verificador.verificar(ORIGINAL, { original: ORIGINAL })).motivos[0], /não tem assinatura/)
  const assinado = await assinarPdf(ORIGINAL, icp)
  const { byteRange } = localizarAssinatura(assinado)
  const corrompido = Buffer.from(assinado)
  corrompido.write('ff', byteRange[1] + 41, 'latin1')
  const v = await verificador.verificar(corrompido, { original: ORIGINAL })
  assert.equal(v.valida, false)
})
