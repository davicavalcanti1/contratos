// Edição básica (docs/BASICA.md): o que está desligado some do site, do
// painel (/eu diz o quê) e das rotas, em todas as superfícies. O que fica
// continua funcionando de ponta a ponta: gerar, enviar, ler sem "o que diz
// a lei", assinar.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EDICOES, aplicarEdicao, edicaoDoAmbiente, linkDeContato } from '../src/edicao.js'
import { SENHA, assinarPeloLink, subirServidor } from './apoio-http.js'

let A
const ADMIN = 'admin@org1.exemplo'
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => {
  A = await subirServidor({ edicao: 'basica', contato: { whatsapp: '+55 (83) 99999-0000' } })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Admin Org Um', email: ADMIN, papel: 'org_admin', senha: SENHA })
})
after(() => A.fechar())

const painel = (caminho, cookie, o = {}) => A.api(`/painel/api${caminho}`, { chave: null, cookie, ...o })

test('EDICAO do ambiente: basica, completa por padrão, e nome errado derruba', () => {
  assert.equal(edicaoDoAmbiente({ EDICAO: 'basica' }).nome, 'basica')
  assert.equal(edicaoDoAmbiente({}).nome, 'completa')
  assert.equal(edicaoDoAmbiente({ EDICAO: ' Basica ' }).nome, 'basica')
  assert.throws(() => edicaoDoAmbiente({ EDICAO: 'premium' }), /não existe/)
  assert.ok(Object.keys(EDICOES.basica).every(k => k === 'nome' || EDICOES.basica[k] === false))
  assert.ok(Object.keys(EDICOES.completa).every(k => k === 'nome' || EDICOES.completa[k] === true))
})

test('marcadores de edição: a básica tira o bloco "completa" e mostra o bloco "basica"', () => {
  const html = 'a<!--completa-->B<!--/completa-->c<!--basica D /basica-->e __CONTATO__'
  assert.equal(aplicarEdicao(html, EDICOES.basica, { whatsapp: '5583999990000' }), 'acDe https://wa.me/5583999990000?text=Ol%C3%A1!%20Vi%20o%20BullaCheck%20e%20quero%20saber%20mais.')
  assert.equal(aplicarEdicao(html, EDICOES.completa, {}), 'aBc<!--basica D /basica-->e /painel')
  assert.equal(linkDeContato({ email: 'oi@bullacheck.com.br' }), 'mailto:oi@bullacheck.com.br')
})

test('o site da básica tem o botão de contato e não tem demonstração por e-mail, validade jurídica nem API', async () => {
  const r = await fetch(`${A.base}/`)
  assert.equal(r.status, 200)
  const html = await r.text()
  assert.match(html, /Falar com a gente/)
  assert.match(html, /wa\.me\/5583999990000/)
  assert.match(html, /ainda não passaram por revisão de advogado/)
  assert.doesNotMatch(html, /id="experimentar"/)
  assert.doesNotMatch(html, /Validade jurídica/)
  assert.doesNotMatch(html, /Vale em juízo/)
  assert.doesNotMatch(html, /API e webhooks/)
  assert.doesNotMatch(html, /<!--completa-->|<!--basica|\/basica-->|__CONTATO__/)
  assert.doesNotMatch(html, /\sstyle="/)
  const seg = await (await fetch(`${A.base}/seguranca`)).text()
  assert.match(seg, /não estão ligados nesta versão/)
  assert.doesNotMatch(seg, /<!--completa-->|<!--basica|\/basica-->|__CONTATO__/)
  const saude = await (await fetch(`${A.base}/saude`)).json()
  assert.equal(saude.edicao, 'basica')
})

test('as superfícies desligadas respondem 404: demo, /v1, /dev, modelos, agenda, exportação, pacote, carimbo, aditivo, ICP, chaves e webhooks', async () => {
  assert.equal((await fetch(`${A.base}/api/demo/contrato?exemplo=pf-determinado`)).status, 404)
  assert.equal((await fetch(`${A.base}/api/demo/pedir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404)
  assert.equal((await A.api('/v1/contratos')).status, 404, 'a chave de API válida não abre o /v1 na básica')
  assert.equal((await fetch(`${A.base}/dev`)).status, 404)
  assert.equal((await fetch(`${A.base}/dev/api/estado`)).status, 404)
  const cookie = await A.entrar(ADMIN)
  for (const rota of ['/org/modelos/prestacao_servicos', '/org/modelos/prestacao_servicos/amostra.pdf', '/org/agenda', '/org/exportar', '/org/indices/IPCA', '/admin/chaves', '/admin/webhooks', '/admin/entregas']) {
    assert.equal((await painel(rota, cookie)).status, 404, rota)
  }
  const gerado = await A.json(await painel('/org/contratos', cookie, { metodo: 'POST', corpo: exemplo('pf-determinado') }))
  assert.equal(gerado.status, 201)
  const id = gerado.corpo.id
  for (const rota of [`/org/contratos/${id}/pacote.zip`, `/org/contratos/${id}/carimbo.tsr`, `/org/contratos/${id}/assinaturas/x/arquivo`]) {
    assert.equal((await painel(rota, cookie)).status, 404, rota)
  }
  for (const rota of [`/org/contratos/${id}/aditivo`, `/org/contratos/${id}/distrato`]) {
    assert.equal((await painel(rota, cookie, { metodo: 'POST', corpo: {} })).status, 404, rota)
  }
})

test('/eu diz a edição, e o que fica funciona: lista de modelos, conferir, prévia sem "o que diz a lei", planilha de exemplo', async () => {
  const cookie = await A.entrar(ADMIN)
  const eu = await A.json(await painel('/eu', cookie))
  assert.equal(eu.corpo.edicao.nome, 'basica')
  assert.equal(eu.corpo.edicao.lei, false)
  const modelos = await A.json(await painel('/org/modelos', cookie))
  assert.equal(modelos.status, 200)
  assert.ok(modelos.corpo.some(m => m.chave === 'prestacao_servicos'))
  const previa = await A.json(await painel('/org/modelos/prestacao_servicos/previa', cookie, { metodo: 'POST', corpo: { dados: exemplo('pf-determinado').dados } }))
  assert.equal(previa.status, 200)
  assert.ok(previa.corpo.contrato.clausulas.every(c => c.fundamentos.length === 0), 'nenhuma cláusula traz o texto da lei na básica')
  const csv = await painel('/org/lotes/exemplo.csv?modelo=prestacao_servicos', cookie)
  assert.equal(csv.status, 200)
  const bytes = Buffer.from(await csv.arrayBuffer())
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM para o Excel')
  const [cabecalho, linha] = bytes.toString('utf8').slice(1).trim().split(/\r?\n/)
  assert.match(cabecalho, /Nome ou razão social do contratado;/)
  assert.doesNotMatch(cabecalho, /CNPJ da contratante/, 'o que vem do cadastro da empresa não é coluna')
  assert.doesNotMatch(cabecalho, /multa/i, 'o que tem padrão não é coluna')
  assert.match(linha, /João da Silva Exemplo/)
  assert.equal((await painel('/org/lotes/exemplo.csv?modelo=inexistente', cookie)).status, 404)
})

test('quem assina lê sem o bloco da lei e assina normalmente; o método é sempre código por e-mail', async () => {
  const cookie = await A.entrar(ADMIN)
  const gerado = await A.json(await painel('/org/contratos', cookie, { metodo: 'POST', corpo: exemplo('pf-determinado') }))
  const id = gerado.corpo.id
  const icp = await A.json(await painel(`/org/contratos/${id}/enviar`, cookie, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@exemplo.com', papel: 'parte', metodo: 'icp', cpf: '529.982.247-25' }] } }))
  assert.equal(icp.status, 400, 'ICP não está ligado na básica')
  const env = await A.json(await painel(`/org/contratos/${id}/enviar`, cookie, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@exemplo.com', papel: 'parte' }] } }))
  assert.equal(env.status, 200)
  const token = A.caixa('joao@exemplo.com', 'link').meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(token, {})
  const { sessao } = A.servico.validarCodigo(token, A.caixa('joao@exemplo.com', 'codigo').meta.codigo, {})
  const conteudo = A.servico.conteudo(token, sessao)
  assert.ok(conteudo.clausulas.every(c => (c.fundamentos || []).length === 0))
  assert.equal((await fetch(`${A.base}/api/assinar/${token}/icp`, { method: 'POST', headers: { 'x-sessao': sessao, 'content-type': 'application/pdf' }, body: 'x' })).status, 404)
  await assinarPeloLink(A, 'joao@exemplo.com', 'João da Silva Exemplo')
  const depois = await A.json(await painel(`/org/contratos/${id}`, cookie))
  assert.equal(depois.corpo.status, 'assinado')
  assert.ok(depois.corpo.codigo_verificacao, 'selado')
})

test('a cláusula das partes aceita pessoa física sem estado civil e profissão, e os cita quando vêm', async () => {
  const cookie = await A.entrar(ADMIN)
  const base = exemplo('pf-determinado')
  const sem = structuredClone(base.dados)
  delete sem.contratado.estado_civil
  delete sem.contratado.profissao
  const p1 = await A.json(await painel('/org/modelos/prestacao_servicos/previa', cookie, { metodo: 'POST', corpo: { dados: sem } }))
  assert.equal(p1.corpo.pronto, true, JSON.stringify(p1.corpo.faltando))
  const partes1 = p1.corpo.contrato.clausulas.find(c => c.chave === 'partes')
  assert.ok(!partes1.paragrafos.some(p => /^O CONTRATADO declara/.test(p.texto)))
  assert.ok(partes1.paragrafos.some(p => /brasileiro\(a\), inscrito\(a\) no CPF/.test(p.texto)))
  const p2 = await A.json(await painel('/org/modelos/prestacao_servicos/previa', cookie, { metodo: 'POST', corpo: { dados: base.dados } }))
  const partes2 = p2.corpo.contrato.clausulas.find(c => c.chave === 'partes')
  assert.ok(partes2.paragrafos.some(p => /declara ser solteiro e exercer a profissão de técnico em informática/.test(p.texto)))
  const so = structuredClone(base.dados)
  delete so.contratado.profissao
  const p3 = await A.json(await painel('/org/modelos/prestacao_servicos/previa', cookie, { metodo: 'POST', corpo: { dados: so } }))
  assert.ok(p3.corpo.contrato.clausulas.find(c => c.chave === 'partes').paragrafos.some(p => p.texto === 'O CONTRATADO declara ser solteiro.'))
})
