import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assinar } from '../src/plataforma/webhooks.js'
import { SENHA, assinarPeloLink, subirServidor } from './apoio-http.js'

let A
const DEV = 'dev@plataforma.exemplo'
const ADMIN = 'admin@org1.exemplo'
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ nome: 'Dev Plataforma', email: DEV, papel: 'developer', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Admin Org Um', email: ADMIN, papel: 'org_admin', senha: SENHA })
})
after(() => A.fechar())

const painel = (caminho, cookie, o = {}) => A.api(`/painel/api${caminho}`, { chave: null, cookie, ...o })

test('login grava cookie HttpOnly e SameSite=Strict; senha errada não', async () => {
  const errado = await painel('/sessao', null, { metodo: 'POST', corpo: { email: ADMIN, senha: 'errada' } })
  assert.equal(errado.status, 401)
  const r = await painel('/sessao', null, { metodo: 'POST', corpo: { email: ADMIN, senha: SENHA } })
  const cookie = r.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Strict/)
  const eu = await A.json(await painel('/eu', cookie.split(';')[0]))
  assert.equal(eu.corpo.organizacao.id, 'org1')
  assert.equal((await A.json(await painel('/eu', null))).corpo, null)
})

test('CSRF: escrita por formulário (urlencoded) é recusada', async () => {
  const cookie = await A.entrar(ADMIN)
  const r = await fetch(`${A.base}/painel/api/admin/chaves`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'nome=x' })
  assert.equal(r.status, 403)
})

test('admin cria chave; ela funciona na API; escopo leitura não escreve', async () => {
  const cookie = await A.entrar(ADMIN)
  const { corpo: escrita } = await A.json(await painel('/admin/chaves', cookie, { metodo: 'POST', corpo: { nome: 'Sistema X', escopo: 'escrita' } }))
  const { corpo: leitura } = await A.json(await painel('/admin/chaves', cookie, { metodo: 'POST', corpo: { nome: 'BI', escopo: 'leitura' } }))
  assert.equal((await A.api('/v1/contratos', { chave: escrita.chave })).status, 200)
  const { modelo, dados } = exemplo('pf-determinado')
  assert.equal((await A.api('/v1/contratos', { chave: leitura.chave, metodo: 'POST', corpo: { modelo, dados } })).status, 403)
  assert.equal((await A.api('/v1/contratos', { chave: escrita.chave, metodo: 'POST', corpo: { modelo, dados } })).status, 201)
  await painel(`/admin/chaves/${escrita.id}`, cookie, { metodo: 'DELETE' })
  assert.equal((await A.api('/v1/contratos', { chave: escrita.chave })).status, 401)
})

test('papéis: leitor não escreve, admin não entra na plataforma, emissor não administra', async () => {
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Leo Leitor', email: 'leitor@org1.exemplo', papel: 'leitor', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Eva Emissora', email: 'emissor@org1.exemplo', papel: 'emissor', senha: SENHA })
  const leitor = await A.entrar('leitor@org1.exemplo')
  const emissor = await A.entrar('emissor@org1.exemplo')
  const admin = await A.entrar(ADMIN)
  const { modelo, dados } = exemplo('pf-determinado')
  assert.equal((await painel('/org/contratos', leitor)).status, 200)
  assert.equal((await painel('/org/contratos', leitor, { metodo: 'POST', corpo: { modelo, dados } })).status, 403)
  assert.equal((await painel('/org/contratos', emissor, { metodo: 'POST', corpo: { modelo, dados } })).status, 201)
  assert.equal((await painel('/admin/usuarios', emissor)).status, 403)
  assert.equal((await painel('/plataforma/organizacoes', admin)).status, 403)
})

test('developer cria organização e convida o admin; o convite vira login', async () => {
  const dev = await A.entrar(DEV)
  const r = await A.json(await painel('/plataforma/organizacoes', dev, {
    metodo: 'POST',
    corpo: { dados: { ...A.repo.obter('organizacoes', 'org1').dados, razao_social: 'Escritório Exemplo Advogados' }, plano: 'teste', admin: { nome: 'Carla Advogada Exemplo', email: 'carla@escritorio.exemplo' } },
  }))
  assert.equal(r.status, 201)
  const token = A.caixa('carla@escritorio.exemplo', 'convite').meta.link.split('/convite/')[1]
  assert.equal((await A.json(await painel(`/convite/${token}`, null))).corpo.organizacao, 'Escritório Exemplo Advogados')
  const aceito = await painel(`/convite/${token}`, null, { metodo: 'POST', corpo: { senha: 'senha-da-carla-123' } })
  assert.equal(aceito.status, 200)
  const cookie = aceito.headers.get('set-cookie').split(';')[0]
  assert.equal((await A.json(await painel('/eu', cookie))).corpo.usuario.papel, 'org_admin')
  // e ela não vê nada da org1
  assert.equal((await A.json(await painel('/org/contratos', cookie))).corpo.total, 0)
})

test('suporte: developer abre a organização só para leitura, e fica na auditoria', async () => {
  const dev = await A.entrar(DEV)
  const comOrg = { cabecalhos: { 'x-organizacao': 'org1' } }
  assert.equal((await painel('/org/contratos', dev)).status, 400)
  const lista = await A.json(await painel('/org/contratos', dev, comOrg))
  assert.equal(lista.status, 200)
  assert.ok(lista.corpo.total > 0)
  const { modelo, dados } = exemplo('pf-determinado')
  assert.equal((await painel('/org/contratos', dev, { ...comOrg, metodo: 'POST', corpo: { modelo, dados } })).status, 403)
  assert.ok(A.plataforma.listarAuditoria({ organizacaoId: 'org1' }).some(a => a.acao === 'suporte.consulta'))
})

test('limite do plano devolve 402 com o consumo', async () => {
  const dev = await A.entrar(DEV)
  await painel('/plataforma/organizacoes/org1', dev, { metodo: 'PATCH', corpo: { limite_contratos_mes: 0 } })
  const { modelo, dados } = exemplo('pf-determinado')
  const r = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  assert.equal(r.status, 402)
  assert.equal(r.corpo.detalhes.limite, 0)
  await painel('/plataforma/organizacoes/org1', dev, { metodo: 'PATCH', corpo: { plano: 'ilimitado' } })
})

test('organização suspensa: consulta sim, alteração não', async () => {
  const dev = await A.entrar(DEV)
  await painel('/plataforma/organizacoes/org1', dev, { metodo: 'PATCH', corpo: { status: 'suspensa' } })
  const { modelo, dados } = exemplo('pf-determinado')
  assert.equal((await A.api('/v1/contratos')).status, 200)
  const r = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  assert.equal(r.status, 403)
  assert.match(r.corpo.erro, /suspensa/)
  await painel('/plataforma/organizacoes/org1', dev, { metodo: 'PATCH', corpo: { status: 'ativa' } })
})

test('webhook ponta a ponta: assinou → evento assinado chega com a referência do cliente', async () => {
  const admin = await A.entrar(ADMIN)
  const { corpo: hook } = await A.json(await painel('/admin/webhooks', admin, {
    metodo: 'POST', corpo: { url: 'http://cliente.exemplo/contratos', eventos: ['contrato.assinado', 'signatario.assinou'] },
  }))
  const { modelo, dados } = exemplo('mei-unica')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados, referencia: 'parceiro-42' } }))
  assert.equal(c.referencia, 'parceiro-42')
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'Ana Exemplo Design', email: 'ana.hook@design.exemplo' }] } })
  await assinarPeloLink(A, 'ana.hook@design.exemplo', 'Ana Exemplo Design')
  await A.webhooks.processar()

  const tipos = A.recebidos.map(r => JSON.parse(r.body).tipo)
  assert.deepEqual(tipos.slice(-2), ['signatario.assinou', 'contrato.assinado'])
  const ultimo = A.recebidos.at(-1)
  const evento = JSON.parse(ultimo.body)
  assert.equal(evento.dados.contrato.referencia, 'parceiro-42')
  assert.match(evento.dados.verificacao_url, /\/v\/[2-9A-Z]{4}-/)
  const { segredo } = (await A.json(await painel(`/admin/webhooks/${hook.id}/segredo`, admin))).corpo
  const [, t, v1] = ultimo.headers['x-contratos-assinatura'].match(/^t=(\d+),v1=(.+)$/)
  assert.equal(v1, assinar(segredo, t, ultimo.body))

  const filtrados = await A.json(await A.api('/v1/contratos?referencia=parceiro-42'))
  assert.equal(filtrados.corpo.total, 1)
  assert.equal((await A.json(await painel('/admin/entregas', admin))).corpo.filter(e => e.status === 'entregue').length, 2)
})

test('saúde da plataforma mostra o que está quebrado', async () => {
  const dev = await A.entrar(DEV)
  const s = (await A.json(await painel('/plataforma/saude', dev))).corpo
  assert.ok(s.organizacoes.total >= 2)
  assert.ok('parados_7_dias' in s.contratos)
  assert.ok('com_falha' in s.webhooks)
})

test('formulário dinâmico: PJ pede CNPJ e representante, PF pede CPF', async () => {
  const conferir = async (dados) => (await A.json(await A.api('/v1/modelos/prestacao_servicos/conferir', { metodo: 'POST', corpo: { dados } }))).corpo
  const pf = await conferir({ contratado: { tipo: 'pf' }, contrato: { prazo_tipo: 'determinado', forma_pagamento: 'mensal' } })
  assert.ok(pf.necessarios.includes('contratado.cpf'))
  assert.ok(!pf.necessarios.includes('contratado.cnpj'))
  assert.ok(pf.necessarios.includes('contrato.duracao_meses'))
  const pj = await conferir({ contratado: { tipo: 'pj' }, contrato: { prazo_tipo: 'indeterminado', forma_pagamento: 'mensal' } })
  assert.ok(pj.necessarios.includes('contratado.cnpj') && pj.necessarios.includes('contratado.representante_nome'))
  assert.ok(!pj.necessarios.includes('contratado.cpf'))
  assert.ok(!pj.necessarios.includes('contrato.duracao_meses'), 'prazo indeterminado não pede duração')
  assert.equal(pj.pronto, false)
  const { dados } = exemplo('pj-indeterminado')
  const pronto = await conferir(dados)
  assert.equal(pronto.pronto, true)
  assert.deepEqual(pronto.signatarios.map(s => s.papel), ['representante'])
})
