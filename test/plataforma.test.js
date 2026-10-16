import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { conferirSenha, criarPlataforma, hashSenha } from '../src/plataforma/plataforma.js'

const ORG = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))

function ambiente() {
  let t = new Date('2026-10-16T15:00:00Z').getTime()
  const relogio = { agora: () => new Date(t), avancar: (ms) => { t += ms } }
  const repo = criarRepo()
  const caixa = []
  const p = criarPlataforma({ repo, notificar: async (m) => caixa.push(m), agora: relogio.agora })
  const dev = p.criarUsuarioDireto({ nome: 'Dev Plataforma', email: 'dev@x.com.br', papel: 'developer', senha: 'senha-do-dev-123' })
  return { repo, caixa, p, relogio, dev }
}

test('senha: scrypt com sal, confere a certa e recusa a errada', () => {
  const h = hashSenha('uma senha qualquer')
  assert.match(h, /^scrypt\$16384\$/)
  assert.notEqual(h, hashSenha('uma senha qualquer'), 'sal diferente a cada vez')
  assert.ok(conferirSenha('uma senha qualquer', h))
  assert.ok(!conferirSenha('outra', h))
})

test('organização nova com convite do admin; convite cria a senha e entra', async () => {
  const { p, caixa, dev } = ambiente()
  const { organizacao, convite } = await p.criarOrganizacao({ dados: ORG, plano: 'essencial', admin: { nome: 'Maria Exemplo Souza', email: 'Maria@Clinica.com.br' } }, dev)
  assert.equal(organizacao.plano.contratos_mes, 200)
  assert.deepEqual(organizacao.cadastro_incompleto, [])
  assert.equal(convite.email, 'maria@clinica.com.br')
  const token = caixa.at(-1).meta.link.split('/convite/')[1]
  assert.equal(p.verConvite(token).organizacao, ORG.razao_social)
  assert.throws(() => p.aceitarConvite(token, 'curta'), /pelo menos/)
  const { usuario } = p.aceitarConvite(token, 'senha-boa-da-maria')
  assert.equal(usuario.papel, 'org_admin')
  assert.throws(() => p.aceitarConvite(token, 'senha-boa-da-maria'), /já usado/)
  assert.ok(p.login('maria@clinica.com.br', 'senha-boa-da-maria').sessao)
})

test('cadastro incompleto da empresa aparece pelo nome do campo', async () => {
  const { p, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: { razao_social: 'Só Nome Ltda.' } }, dev)
  assert.ok(organizacao.cadastro_incompleto.includes('CNPJ'))
  assert.ok(organizacao.cadastro_incompleto.includes('E-mail do encarregado de dados (DPO)'))
})

test('login: 5 erros bloqueiam por 15 min, e o bloqueio passa', async () => {
  const { p, relogio } = ambiente()
  for (let i = 0; i < 5; i++) assert.throws(() => p.login('dev@x.com.br', 'errada'), e => e.status === 401)
  assert.throws(() => p.login('dev@x.com.br', 'senha-do-dev-123'), e => e.status === 429)
  relogio.avancar(16 * 60e3)
  assert.ok(p.login('dev@x.com.br', 'senha-do-dev-123').sessao)
})

test('sessão expira em 12 h; trocar a senha derruba as outras sessões', () => {
  const { p, relogio } = ambiente()
  const a = p.login('dev@x.com.br', 'senha-do-dev-123').sessao
  const b = p.login('dev@x.com.br', 'senha-do-dev-123').sessao
  assert.ok(p.sessaoDe(a))
  const { sessao: nova } = p.trocarSenha(p.sessaoDe(a).usuario.id, 'senha-do-dev-123', 'nova-senha-do-dev')
  assert.equal(p.sessaoDe(b), null)
  assert.ok(p.sessaoDe(nova))
  relogio.avancar(13 * 3600e3)
  assert.equal(p.sessaoDe(nova), null)
})

test('chave de API: só o hash fica guardado, mostra uma vez, revogada para de funcionar', async () => {
  const { p, repo, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: ORG }, dev)
  const c = p.criarChave(organizacao.id, { nome: 'Integração ExameQR', escopo: 'leitura' }, dev)
  assert.match(c.chave, /^cs_/)
  assert.ok(!JSON.stringify(repo.listar('chaves_api')).includes(c.chave), 'valor da chave não está no armazenamento')
  assert.equal(p.listarChaves(organizacao.id)[0].chave, undefined, 'listagem não mostra a chave')
  assert.equal(p.autenticarChave(c.chave).chave.escopo, 'leitura')
  p.revogarChave(organizacao.id, c.id, dev)
  assert.equal(p.autenticarChave(c.chave), null)
})

test('limite do plano: conta os contratos do mês e bloqueia o que passaria', async () => {
  const { p, repo, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: ORG, plano: 'teste' }, dev)
  for (let i = 0; i < 19; i++) repo.inserir('contratos', { organizacao_id: organizacao.id, criado_em: '2026-10-10T12:00:00Z' })
  repo.inserir('contratos', { organizacao_id: organizacao.id, criado_em: '2026-09-30T12:00:00Z' }) // mês passado não conta
  assert.doesNotThrow(() => p.checarLimite(organizacao.id, 1))
  assert.throws(() => p.checarLimite(organizacao.id, 2), e => e.status === 402 && /19 de 20/.test(e.message))
  p.atualizarOrganizacao(organizacao.id, { limite_contratos_mes: 100 }, dev)
  assert.doesNotThrow(() => p.checarLimite(organizacao.id, 50))
})

test('organização suspensa não gera nada', async () => {
  const { p, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: ORG, plano: 'ilimitado' }, dev)
  p.atualizarOrganizacao(organizacao.id, { status: 'suspensa' }, dev)
  assert.throws(() => p.checarLimite(organizacao.id), e => e.status === 403)
})

test('a organização nunca fica sem administrador ativo', async () => {
  const { p, caixa, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: ORG, admin: { nome: 'Ana Admin Um', email: 'a1@x.com.br' } }, dev)
  const { usuario: a1 } = p.aceitarConvite(caixa.at(-1).meta.link.split('/convite/')[1], 'senha-boa-do-a1')
  await p.convidar({ organizacaoId: organizacao.id, nome: 'Bruno Emissor', email: 'b@x.com.br', papel: 'emissor' }, a1)
  const { usuario: b } = p.aceitarConvite(caixa.at(-1).meta.link.split('/convite/')[1], 'senha-boa-do-bruno')
  assert.throws(() => p.alterarUsuario(organizacao.id, a1.id, { ativo: false }, a1), /próprio/)
  const a1Completo = { ...a1, id: a1.id }
  assert.throws(() => p.alterarUsuario(organizacao.id, a1.id, { papel: 'leitor' }, { id: 'outro' }), /pelo menos um administrador/)
  assert.equal(p.alterarUsuario(organizacao.id, b.id, { papel: 'leitor' }, a1Completo).papel, 'leitor')
})

test('auditoria registra quem fez o quê e não aceita edição', async () => {
  const { p, repo, dev } = ambiente()
  const { organizacao } = await p.criarOrganizacao({ dados: ORG }, dev)
  p.criarChave(organizacao.id, { nome: 'X' }, dev)
  const acoes = p.listarAuditoria({ organizacaoId: organizacao.id }).map(a => a.acao)
  assert.ok(acoes.includes('organizacao.criada') && acoes.includes('chave.criada'))
  assert.throws(() => repo.atualizar('auditoria', repo.listar('auditoria')[0].id, { acao: 'x' }), /append-only/)
})
