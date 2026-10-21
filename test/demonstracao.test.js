// Demonstração real pelo site: o visitante pede, recebe um contrato de
// verdade, assina, e vira interessado na plataforma.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { ORG_DEMO } from '../src/plataforma/demonstracao.js'
import { SENHA, assinarPeloLink, subirServidor } from './apoio-http.js'

let A, dev
const DEV = 'dev@plataforma.exemplo'

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ nome: 'Dev Plataforma', email: DEV, papel: 'developer', senha: SENHA })
  dev = await A.entrar(DEV)
})
after(() => A.fechar())

const pedido = async (corpo) => A.json(await A.api('/api/demo/pedir', { chave: null, metodo: 'POST', corpo }))

test('pedir pelo site: cria a organização de demonstração, gera e envia o contrato com o nome da pessoa, avisa o developer', async () => {
  assert.equal(A.repo.obter('organizacoes', ORG_DEMO), null, 'a organização nasce no primeiro pedido')
  const r = await pedido({ nome: 'Davi Cavalcanti Araújo', email: 'davi@clinica-teste.com.br', empresa: 'Clínica Teste', telefone: '(83) 99999-0000' })
  assert.equal(r.status, 201, JSON.stringify(r.corpo))
  assert.equal(r.corpo.enviado_para, 'd***@clinica-teste.com.br')
  assert.match(r.corpo.link, /\/assinar\//, 'fora de produção o link vem na resposta')
  const org = A.repo.obter('organizacoes', ORG_DEMO)
  assert.equal(org.marca.nome, 'Clínica Exemplo')
  const [c] = A.repo.listar('contratos', x => x.organizacao_id === ORG_DEMO)
  assert.equal(c.status, 'enviado')
  assert.equal(c.referencia, 'site:davi@clinica-teste.com.br')
  assert.match(c.snapshot.clausulas[0].paragrafos[1].texto, /CONTRATADO: Davi Cavalcanti Araújo/)
  const link = A.caixa('davi@clinica-teste.com.br', 'link')
  assert.match(link.assunto, /^Clínica Exemplo enviou um contrato/)
  const aviso = A.caixa(DEV, 'interessado')
  assert.match(aviso.assunto, /Interessado pelo site: Davi Cavalcanti Araújo \(Clínica Teste\)/)
  assert.match(aviso.texto, /WhatsApp: \(83\) 99999-0000/)
})

test('limites: mesmo e-mail só uma vez por dia; nome incompleto e e-mail inválido são recusados; robô no campo-armadilha não cria nada', async () => {
  let r = await pedido({ nome: 'Davi Cavalcanti Araújo', email: 'DAVI@clinica-teste.com.br' })
  assert.equal(r.status, 429)
  assert.match(r.corpo.erro, /já enviamos/i)
  r = await pedido({ nome: 'Davi', email: 'outro@clinica-teste.com.br' })
  assert.equal(r.status, 400)
  r = await pedido({ nome: 'Ana Souza', email: 'sem-arroba' })
  assert.equal(r.status, 400)
  const antes = A.repo.listar('interessados').length
  r = await pedido({ nome: 'Robô Spammer', email: 'robo@spam.exemplo', site: 'http://spam' })
  assert.equal(r.status, 201, 'o robô acha que deu certo')
  assert.equal(A.repo.listar('interessados').length, antes, 'mas nada foi criado')
})

test('a pessoa assina o contrato de exemplo e a plataforma vê até onde ela foi; só o developer lista', async () => {
  const r = await pedido({ nome: 'Ana Beatriz Lima', email: 'ana@outra-clinica.com.br' })
  assert.equal(r.status, 201)
  let lista = (await A.json(await A.api('/painel/api/plataforma/interessados', { chave: null, cookie: dev }))).corpo
  assert.equal(lista.length, 2)
  assert.equal(lista[0].nome, 'Ana Beatriz Lima')
  assert.equal(lista[0].signatario_status, 'notificado')
  assert.equal(lista[0].contrato.status, 'enviado')

  await assinarPeloLink(A, 'ana@outra-clinica.com.br', 'Ana Beatriz Lima')
  lista = (await A.json(await A.api('/painel/api/plataforma/interessados', { chave: null, cookie: dev }))).corpo
  assert.equal(lista[0].contrato.status, 'assinado')
  assert.match(lista[0].contrato.codigo_verificacao, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  const selo = await A.json(await A.api(`/api/verificar/${lista[0].contrato.codigo_verificacao}`, { chave: null }))
  assert.equal(selo.corpo.organizacao, 'Clínica Exemplo Diagnóstico por Imagem Ltda.')

  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Admin Org', email: 'admin@org1.exemplo', papel: 'org_admin', senha: SENHA })
  const admin = await A.entrar('admin@org1.exemplo')
  assert.equal((await A.api('/painel/api/plataforma/interessados', { chave: null, cookie: admin })).status, 403)
})

test('limite por IP: depois de alguns pedidos na mesma hora, 429', async () => {
  let ultimo
  for (let i = 0; i < 6; i++) ultimo = await pedido({ nome: `Pessoa Número ${i}`, email: `pessoa${i}@clinica-limite.com.br` })
  assert.equal(ultimo.status, 429)
  assert.match(ultimo.corpo.erro, /Muitas tentativas/)
})
