// Marca da organização: nome de exibição, cor com contraste e logotipo, e
// como isso chega à tela de assinatura e ao e-mail do signatário.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contrasteComBranco, detectarImagem } from '../src/plataforma/marca.js'
import { SENHA, subirServidor } from './apoio-http.js'

let A, admin, emissor
const ADMIN = 'admin@org1.exemplo'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const SVG = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/></svg>'
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Admin Org Um', email: ADMIN, papel: 'org_admin', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Eva Emissora', email: 'eva@org1.exemplo', papel: 'emissor', senha: SENHA })
  admin = await A.entrar(ADMIN)
  emissor = await A.entrar('eva@org1.exemplo')
})
after(() => A.fechar())

const painel = async (caminho, cookie, o = {}) => A.json(await A.api(`/painel/api${caminho}`, { chave: null, cookie, ...o }))
const logo = (cookie, buffer, tipo = 'application/octet-stream') => fetch(`${A.base}/painel/api/admin/marca/logo`, { method: 'POST', headers: { cookie, 'content-type': tipo }, body: buffer })

test('imagem é reconhecida pelo conteúdo; contraste com branco segue a régua WCAG', () => {
  assert.equal(detectarImagem(PNG), 'png')
  assert.equal(detectarImagem(Buffer.from(SVG)), 'svg')
  assert.equal(detectarImagem(Buffer.from('%PDF-1.4 ........')), null)
  assert.ok(contrasteComBranco('#1f6aa5') > 4.5, 'o azul do produto passa')
  assert.ok(contrasteComBranco('#ffe04a') < 2, 'o amarelo da bula não serve para botão')
})

test('admin define nome e cor; cor clara ou mal formada é recusada; emissor não mexe', async () => {
  let r = await painel('/admin/marca', admin)
  assert.deepEqual(r.corpo, { nome: null, cor: null, logo_url: null })
  r = await painel('/admin/marca', admin, { metodo: 'PUT', corpo: { nome: '  IMAGO   Diagnóstico ', cor: '#0B5D3B' } })
  assert.equal(r.status, 200)
  assert.deepEqual(r.corpo, { nome: 'IMAGO Diagnóstico', cor: '#0b5d3b', logo_url: null })
  r = await painel('/admin/marca', admin, { metodo: 'PUT', corpo: { cor: '#ffe04a' } })
  assert.equal(r.status, 400)
  assert.match(r.corpo.erro, /clara demais/)
  r = await painel('/admin/marca', admin, { metodo: 'PUT', corpo: { cor: 'verde' } })
  assert.equal(r.status, 400)
  r = await painel('/admin/marca', admin, { metodo: 'PUT', corpo: { nome: 'x'.repeat(61) } })
  assert.equal(r.status, 400)
  assert.equal((await painel('/admin/marca', emissor, { metodo: 'PUT', corpo: { nome: 'Eva' } })).status, 403)
  assert.equal((await painel('/admin/marca', admin)).corpo.cor, '#0b5d3b', 'nada do que foi recusado ficou')
})

test('logotipo: PNG entra e é servido com cache; PDF e SVG com script são recusados; remover limpa', async () => {
  let r = await A.json(await logo(admin, PNG))
  assert.equal(r.status, 201)
  assert.match(r.corpo.logo_url, /^\/marca\/marca-org1-[0-9a-f]{16}\.png$/)
  const img = await fetch(`${A.base}${r.corpo.logo_url}`)
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('content-type'), 'image/png')
  assert.match(img.headers.get('cache-control'), /max-age=86400/)
  assert.equal((await img.arrayBuffer()).byteLength, PNG.length)

  assert.equal((await A.json(await logo(admin, Buffer.from('%PDF-1.4 nada')))).status, 400)
  const malicioso = SVG.replace('<rect', '<script>alert(1)</script><rect')
  r = await A.json(await logo(admin, Buffer.from(malicioso)))
  assert.equal(r.status, 400)
  assert.match(r.corpo.erro, /script/)
  r = await A.json(await logo(admin, Buffer.from(SVG)))
  assert.equal(r.status, 201)
  assert.match(r.corpo.logo_url, /\.svg$/)
  assert.equal((await fetch(`${A.base}${r.corpo.logo_url}`)).headers.get('content-type'), 'image/svg+xml')
  assert.equal((await fetch(`${A.base}/marca/org1-original.pdf`)).status, 404, 'só logotipo sai por aqui')

  r = await painel('/admin/marca/logo', admin, { metodo: 'DELETE' })
  assert.equal(r.corpo.logo_url, null)
  assert.equal(r.corpo.nome, 'IMAGO Diagnóstico', 'nome e cor ficam')
})

test('a tela de assinatura e o e-mail do link usam a marca; sem marca, a razão social', async () => {
  await A.json(await logo(admin, PNG))
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@exemplo.com' }] } })
  const email = A.caixa('joao@exemplo.com', 'link')
  assert.match(email.assunto, /^IMAGO Diagnóstico enviou um contrato/)
  assert.match(email.texto, /IMAGO Diagnóstico enviou o "Contrato de Prestação de Serviços"/)
  const token = email.meta.link.split('/assinar/')[1]
  const info = A.servico.abrir(token, {})
  assert.equal(info.organizacao, 'IMAGO Diagnóstico')
  assert.equal(info.marca.cor, '#0b5d3b')
  assert.match(info.marca.logo_url, /\.png$/)
  const { corpo: conteudo } = await A.json(await A.api(`/api/assinar/${token}`, { chave: null }))
  assert.equal(conteudo.marca.nome, 'IMAGO Diagnóstico')

  await painel('/admin/marca', admin, { metodo: 'PUT', corpo: { nome: '', cor: '' } })
  await painel('/admin/marca/logo', admin, { metodo: 'DELETE' })
  const semMarca = A.servico.abrir(token, {})
  assert.equal(semMarca.organizacao, 'Exemplo Serviços Médicos Ltda.')
  assert.deepEqual(semMarca.marca, { nome: null, cor: null, logo_url: null })
})
