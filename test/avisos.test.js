// Avisos à organização (assinou, assinado por todos, recusou, expirando,
// expirou) e lembretes automáticos ao signatário pela agenda.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { carregarBiblioteca } from '../src/biblioteca.js'
import { criarAvisos } from '../src/plataforma/avisos.js'
import { criarAgenda } from '../src/vida/agenda.js'

const bib = carregarBiblioteca()
const organizacao = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))
const BASE = 'https://contratos.exemplo'
const H = 3600e3

function ambiente() {
  let t = new Date('2026-10-20T15:00:00Z').getTime()
  const relogio = { agora: () => new Date(t), avancar: (horas) => { t += horas * H } }
  const repo = criarRepo()
  const caixa = []
  const eventos = []
  const notificar = async (m) => caixa.push(m)
  const avisos = criarAvisos({ repo, notificar, config: { baseUrl: BASE }, log: { error() {} } })
  const aoEvento = (org, tipo, dados) => { eventos.push({ org, tipo, dados }); avisos.aoEvento(org, tipo, dados) }
  const servico = criarServico({ repo, biblioteca: bib, notificar, agora: relogio.agora, aoEvento, config: { baseUrl: BASE } })
  const agenda = criarAgenda({ repo, servico, notificar, aoEvento, agora: relogio.agora, config: { baseUrl: BASE } })
  const ana = repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Ana Admin', email: 'ana.admin@clinica.exemplo', papel: 'org_admin', ativo: true })
  const eva = repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Eva Emissora', email: 'eva@clinica.exemplo', papel: 'emissor', ativo: true })
  const edu = repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Edu Emissor', email: 'edu@clinica.exemplo', papel: 'emissor', ativo: true })
  repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Leo Leitor', email: 'leo@clinica.exemplo', papel: 'leitor', ativo: true })
  repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Ina Inativa', email: 'ina@clinica.exemplo', papel: 'org_admin', ativo: false })
  repo.inserir('usuarios', { organizacao_id: 'org2', nome: 'Otto Outro', email: 'otto@outra.exemplo', papel: 'org_admin', ativo: true })
  const de = (tipo, contratoId) => caixa.filter(m => m.meta.tipo === tipo && (!contratoId || m.meta.contrato_id === contratoId))
  const paras = (tipo, contratoId) => de(tipo, contratoId).map(m => m.para).sort()
  return { relogio, repo, caixa, eventos, servico, agenda, avisos, ana, eva, edu, de, paras }
}

const SIG = [
  { nome: 'Maria Exemplo Souza', email: 'maria@clinica.exemplo', papel: 'representante' },
  { nome: 'João da Silva Exemplo', email: 'joao@prestador.exemplo', papel: 'parte' },
]

async function enviado(A, { ator = A.eva, prazo_dias, ordem } = {}) {
  const { modelo, dados } = exemplo('pf-determinado')
  const c = await A.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados })
  await A.servico.enviar(c.id, 'org1', { signatarios: SIG, prazo_dias, ordem }, { ator })
  return A.servico.consultar(c.id, 'org1')
}

const ultimoLink = (A, contratoId, email) =>
  A.caixa.filter(m => m.para === email && ['link', 'lembrete'].includes(m.meta.tipo) && m.meta.contrato_id === contratoId).at(-1).meta.link.split('/assinar/')[1]

async function entrar(A, contratoId, email) {
  const token = ultimoLink(A, contratoId, email)
  await A.servico.solicitarCodigo(token, {})
  const codigo = A.caixa.filter(m => m.para === email && m.meta.tipo === 'codigo').at(-1).meta.codigo
  const { sessao } = A.servico.validarCodigo(token, codigo, {})
  return { token, sessao }
}

async function assinarComo(A, contratoId, s) {
  const { token, sessao } = await entrar(A, contratoId, s.email)
  for (const cl of A.servico.conteudo(token, sessao).clausulas.filter(c => c.critica)) A.servico.darCiencia(token, sessao, cl.chave, {}, {})
  A.servico.registrarLeitura(token, sessao, {}, {})
  await A.servico.assinar(token, sessao, { nome_digitado: s.nome, concordo: true }, {})
  await A.avisos.aguardar()
}

test('avisos: quem enviou e os administradores sabem quem assinou e quem falta; a última assinatura gera só "assinado por todos"', async () => {
  const A = ambiente()
  const c = await enviado(A)
  assert.equal(A.repo.obter('contratos', c.id).enviado_por.usuario_id, A.eva.id)

  await assinarComo(A, c.id, SIG[0])
  assert.deepEqual(A.paras('aviso.signatario.assinou'), ['ana.admin@clinica.exemplo', 'eva@clinica.exemplo'], 'quem enviou + admins; nem leitor, nem inativo, nem outro emissor, nem outra organização')
  const aviso = A.de('aviso.signatario.assinou')[0]
  assert.match(aviso.assunto, /^Maria assinou: /)
  assert.match(aviso.texto, /Maria Exemplo Souza \(representante legal\) assinou/)
  assert.match(aviso.texto, /Falta: João da Silva Exemplo\./)
  assert.match(aviso.texto, new RegExp(`${BASE}/painel/contratos/${c.id}`))

  await assinarComo(A, c.id, SIG[1])
  assert.equal(A.de('aviso.signatario.assinou').length, 2, 'a última assinatura não gera "assinou" avulso')
  assert.deepEqual(A.paras('aviso.contrato.assinado'), ['ana.admin@clinica.exemplo', 'eva@clinica.exemplo'])
  const fim = A.de('aviso.contrato.assinado')[0]
  const codigo = A.repo.obter('contratos', c.id).codigo_verificacao
  assert.match(fim.assunto, /^Assinado por todos: /)
  assert.match(fim.texto, new RegExp(`Código de verificação: ${codigo}`))
  assert.match(fim.texto, new RegExp(`${BASE}/v/${codigo}`))
  assert.match(fim.texto, /^Olá, Eva\./, 'o aviso chama a pessoa pelo nome')
})

test('avisos: enviado pela API (sem pessoa), administradores e emissores recebem; recusa traz o motivo', async () => {
  const A = ambiente()
  const c = await enviado(A, { ator: { id: 'chave-1', tipo: 'chave_api', email: null } })
  assert.deepEqual(A.repo.obter('contratos', c.id).enviado_por, { chave_api: 'chave-1' })
  const { token, sessao } = await entrar(A, c.id, SIG[1].email)
  A.servico.recusar(token, sessao, { motivo: 'O valor combinado foi outro.' }, {})
  await A.avisos.aguardar()
  assert.deepEqual(A.paras('aviso.contrato.recusado'), ['ana.admin@clinica.exemplo', 'edu@clinica.exemplo', 'eva@clinica.exemplo'])
  const aviso = A.de('aviso.contrato.recusado')[0]
  assert.match(aviso.assunto, /^Recusado por João: /)
  assert.match(aviso.texto, /Motivo informado: "O valor combinado foi outro\."/)
})

test('lembretes: 3 e 1 dia antes de expirar, com link novo e uma vez só; quem está lendo não recebe; a organização é avisada no último; sem acesso, expira na agenda', async () => {
  const A = ambiente()
  const c = await enviado(A, { prazo_dias: 7 })
  const linkOriginal = ultimoLink(A, c.id, SIG[0].email)

  assert.equal((await A.agenda.executar()).length, 0, 'recém-enviado: o link é a novidade, sem lembrete')

  A.relogio.avancar(4 * 24 + 1) // faltam ~2,96 dias
  let feitos = await A.agenda.executar()
  assert.deepEqual(feitos.map(f => [f.tipo, f.dias, f.lembrados]), [['lembrete', 3, 2]])
  assert.deepEqual(A.paras('lembrete', c.id), ['joao@prestador.exemplo', 'maria@clinica.exemplo'])
  const lembrete = A.de('lembrete', c.id)[0]
  assert.match(lembrete.assunto, /^Lembrete: "Contrato de Prestação de Serviços" espera a sua assinatura até 27\/10\/2026/)
  assert.match(lembrete.texto, /O prazo termina em 27\/10\/2026 \(em 3 dias\)/)
  assert.throws(() => A.servico.abrir(linkOriginal), /substituído por um mais novo/, 'o link anterior deixa de valer')
  assert.equal(A.servico.trilha.listar(c.id).filter(e => e.tipo === 'lembrete.enviado').length, 2, 'cada lembrete fica na trilha')
  assert.equal((await A.agenda.executar()).length, 0, 'uma hora depois, nada se repete')
  assert.equal(A.de('aviso.contrato.expirando', c.id).length, 0, 'a organização só é avisada no último lembrete')

  A.relogio.avancar(50) // faltam ~0,9 dia
  await entrar(A, c.id, SIG[0].email) // Maria está lendo agora: o lembrete derrubaria a sessão dela
  feitos = await A.agenda.executar()
  assert.deepEqual(feitos.map(f => [f.tipo, f.dias, f.lembrados]), [['lembrete', 1, 1]])
  assert.equal(A.de('lembrete', c.id).length, 3)
  assert.equal(A.de('lembrete', c.id).at(-1).para, 'joao@prestador.exemplo')
  assert.match(A.de('lembrete', c.id).at(-1).texto, /\(amanhã\)/)
  assert.deepEqual(A.paras('aviso.contrato.expirando', c.id), ['ana.admin@clinica.exemplo', 'eva@clinica.exemplo'])
  const expirando = A.de('aviso.contrato.expirando', c.id)[0]
  assert.match(expirando.assunto, /^Expira amanhã: /)
  assert.match(expirando.texto, /ainda faltam Maria Exemplo Souza, João da Silva Exemplo\. Enviamos um lembrete com link novo para João da Silva Exemplo\./)
  assert.equal(A.eventos.filter(e => e.tipo === 'contrato.expirando').length, 1, 'webhook também')
  assert.equal((await A.agenda.executar()).length, 0)

  A.relogio.avancar(26) // passou do prazo, ninguém abriu nada
  await A.agenda.executar()
  await A.avisos.aguardar()
  assert.equal(A.repo.obter('contratos', c.id).status, 'expirado')
  assert.deepEqual(A.paras('aviso.contrato.expirado', c.id), ['ana.admin@clinica.exemplo', 'eva@clinica.exemplo'])
  assert.match(A.de('aviso.contrato.expirado', c.id)[0].texto, /Maria Exemplo Souza, João da Silva Exemplo não assinaram/)
  assert.equal(A.eventos.filter(e => e.tipo === 'contrato.expirado').length, 1)
})

test('lembretes: na ordem sequencial só quem está na vez é lembrado; quem já assinou não', async () => {
  const A = ambiente()
  const c = await enviado(A, { prazo_dias: 5, ordem: 'sequencial' })
  A.relogio.avancar(2 * 24 + 1)
  const feitos = await A.agenda.executar()
  assert.deepEqual(feitos.map(f => [f.dias, f.lembrados]), [[3, 1]])
  assert.deepEqual(A.paras('lembrete', c.id), ['maria@clinica.exemplo'])

  const B = ambiente()
  const d = await enviado(B, { prazo_dias: 5 })
  await assinarComo(B, d.id, SIG[0])
  B.relogio.avancar(2 * 24 + 1)
  await B.agenda.executar()
  assert.deepEqual(B.paras('lembrete', d.id), ['joao@prestador.exemplo'])
})
