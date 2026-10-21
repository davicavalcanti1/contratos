// Bloco técnico de 20/out: fontes servidas pelo próprio sistema (CSP sem
// Google), abertura do link registrada uma vez por hora, pacote de prova em
// .zip com tudo que o perito precisa.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { assinarPeloLink, subirServidor } from './apoio-http.js'

let A
let t = new Date('2026-10-20T15:00:00Z').getTime()
const relogio = { agora: () => new Date(t), avancar: (ms) => { t += ms } }
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => { A = await subirServidor({ agora: relogio.agora }) })
after(() => A.fechar())

// Entradas de um .zip, lidas do diretório central (assinatura PK\1\2): nome,
// método, tamanho comprimido e onde está o cabeçalho local.
function entradasDoZip(buf) {
  const entradas = []
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue
    const n = buf.readUInt16LE(i + 28), e = buf.readUInt16LE(i + 30), c = buf.readUInt16LE(i + 32)
    entradas.push({ nome: buf.toString('utf8', i + 46, i + 46 + n), metodo: buf.readUInt16LE(i + 10), comprimido: buf.readUInt32LE(i + 20), local: buf.readUInt32LE(i + 42) })
    i += 45 + n + e + c
  }
  return entradas
}
function lerEntrada(buf, nome) {
  const ent = entradasDoZip(buf).find(x => x.nome === nome)
  assert.ok(ent, `entrada ${nome} no zip`)
  const h = ent.local
  assert.equal(buf.readUInt32LE(h), 0x04034b50)
  const inicio = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28)
  const dados = buf.subarray(inicio, inicio + ent.comprimido)
  return ent.metodo === 8 ? inflateRawSync(dados) : dados
}

test('fontes: servidas de /estatico/fontes com cache longo; a CSP das telas públicas não cita o Google', async () => {
  const css = await fetch(`${A.base}/estatico/fontes.css`)
  assert.equal(css.status, 200)
  const texto = await css.text()
  assert.match(texto, /font-family: 'Lexend'/)
  assert.doesNotMatch(texto, /url\(\s*['"]?(https?:)?\/\//, 'nenhuma fonte vem de fora')
  const woff = await fetch(`${A.base}/estatico/fontes/lexend.woff2`)
  assert.equal(woff.status, 200)
  assert.match(woff.headers.get('cache-control'), /max-age=31536000/)
  assert.equal((await woff.arrayBuffer()).byteLength > 10_000, true)
  for (const p of ['/assinar/x', '/verificar', '/']) {
    const r = await fetch(`${A.base}${p}`)
    const csp = r.headers.get('content-security-policy') || ''
    assert.match(csp, /font-src 'self'/, p)
    assert.doesNotMatch(csp, /googleapis|gstatic/, p)
    assert.doesNotMatch(await r.text(), /fonts\.googleapis\.com/, `${p} não carrega fonte de fora`)
  }
})

test('link.aberto: abrir o link várias vezes na mesma hora registra uma vez; passada a hora, outra', async () => {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@exemplo.com' }] } })
  const token = A.caixa('joao@exemplo.com', 'link').meta.link.split('/assinar/')[1]
  for (let i = 0; i < 5; i++) assert.equal((await A.api(`/api/assinar/${token}`, { chave: null })).status, 200)
  const abertos = () => A.servico.trilha.listar(c.id).filter(e => e.tipo === 'link.aberto').length
  assert.equal(abertos(), 1, 'scanner de e-mail ou recarregar a página não enchem a trilha')
  relogio.avancar(61 * 60e3)
  await A.api(`/api/assinar/${token}`, { chave: null })
  assert.equal(abertos(), 2, 'uma hora depois, conta de novo')
})

test('pacote de prova: zip com PDF assinado, original, dossiê (pdf e json) e LEIA-ME com os hashes', async () => {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  // Antes de assinar: sem via final, o pacote avisa.
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'Maria Exemplo Souza', email: 'maria@exemplo.com' }] } })
  let r = await A.api(`/v1/contratos/${c.id}/pacote.zip`)
  assert.equal(r.status, 200)
  let nomes = entradasDoZip(Buffer.from(await r.arrayBuffer())).map(e => e.nome)
  assert.deepEqual(nomes, ['LEIA-ME.txt', 'contrato-original.pdf', 'dossie.pdf', 'dossie.json'])

  await assinarPeloLink(A, 'maria@exemplo.com', 'Maria Exemplo Souza')
  r = await A.api(`/v1/contratos/${c.id}/pacote.zip`)
  assert.equal(r.headers.get('content-type'), 'application/zip')
  assert.match(r.headers.get('content-disposition'), /prova-contrato-de-prestacao-de-servicos-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\.zip/)
  const zip = Buffer.from(await r.arrayBuffer())
  nomes = entradasDoZip(zip).map(e => e.nome)
  assert.deepEqual(nomes, ['LEIA-ME.txt', 'contrato-assinado.pdf', 'contrato-original.pdf', 'dossie.pdf', 'dossie.json'])
  const { corpo: det } = await A.json(await A.api(`/v1/contratos/${c.id}`))
  const leiame = lerEntrada(zip, 'LEIA-ME.txt').toString('utf8')
  assert.ok(leiame.includes(det.pdf_final_sha256), 'o LEIA-ME traz o SHA-256 da via assinada')
  assert.ok(leiame.includes(`/v/${det.codigo_verificacao}`), 'e o link do selo')
  assert.ok(leiame.includes('certutil -hashfile'))
  const final = await A.api(`/v1/contratos/${c.id}/arquivo?qual=final`)
  assert.ok(lerEntrada(zip, 'contrato-assinado.pdf').equals(Buffer.from(await final.arrayBuffer())), 'o PDF no zip é byte a byte o PDF assinado')
  assert.equal(JSON.parse(lerEntrada(zip, 'dossie.json').toString('utf8')).contrato.codigo_verificacao, det.codigo_verificacao)
  // Outra organização não baixa.
  assert.equal((await A.api(`/v1/contratos/${c.id}/pacote.zip`, { chave: 'outra-chave' })).status, 401)
})

test('segurança e privacidade: página pública com CSP, linkada no site e no selo', async () => {
  const r = await fetch(`${A.base}/seguranca`)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/)
  const html = await r.text()
  for (const t of ['O que guardamos de cada contrato', 'LGPD', 'SHA-256', 'Por quanto tempo', 'O que não fazemos', 'controladora', 'operador']) assert.ok(html.includes(t), t)
  assert.doesNotMatch(html, /fonts\.googleapis/)
  assert.match(await (await fetch(`${A.base}/`)).text(), /href="\/seguranca"/)
  assert.match(await (await fetch(`${A.base}/verificar`)).text(), /href="\/seguranca#integridade"/)
})
