import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { verificarTrilha } from '../src/assinatura/trilha.js'
import { carregarBiblioteca } from '../src/biblioteca.js'

const bib = carregarBiblioteca()
const organizacao = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

// Relógio controlável e caixa de saída em memória.
function ambiente() {
  let t = new Date('2026-10-16T12:00:00Z').getTime()
  const relogio = { agora: () => new Date(t), avancar: (ms) => { t += ms } }
  const repo = criarRepo()
  const caixa = []
  const servico = criarServico({ repo, biblioteca: bib, agora: relogio.agora, notificar: async (m) => caixa.push(m) })
  const ultima = (para, tipo) => caixa.filter(m => m.para === para && m.meta.tipo === tipo).at(-1)
  const tokenDe = (para) => ultima(para, 'link').meta.link.split('/assinar/')[1]
  return { relogio, repo, caixa, servico, ultima, tokenDe }
}

const SIGNATARIOS = [
  { nome: 'Maria Exemplo Souza', email: 'maria@clinica-exemplo.com.br', papel: 'representante' },
  { nome: 'João da Silva Exemplo', email: 'joao@prestador-exemplo.com.br', cpf: '529.982.247-25', papel: 'parte' },
]

async function preparar(amb, { ordem = 'paralela' } = {}) {
  const { modelo, dados } = exemplo('pf-determinado')
  const c = await amb.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados })
  await amb.servico.enviar(c.id, 'org1', { signatarios: SIGNATARIOS, ordem })
  return c
}

// Percorre o fluxo inteiro de um signatário até assinar.
async function assinarComo(amb, email, nome) {
  const token = amb.tokenDe(email)
  amb.servico.abrir(token, { ip: '200.1.1.1' })
  await amb.servico.solicitarCodigo(token, {})
  const { sessao } = amb.servico.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {})
  const cont = amb.servico.conteudo(token, sessao)
  for (const cl of cont.clausulas.filter(x => x.critica)) amb.servico.darCiencia(token, sessao, cl.chave, { tempo_leitura_ms: 4200 }, {})
  amb.servico.registrarLeitura(token, sessao, { tempos: { partes: 3000 } }, {})
  return amb.servico.assinar(token, sessao, { nome_digitado: nome, concordo: true }, { ip: '200.1.1.1', user_agent: 'teste' })
}

test('fluxo completo: dois signatários em paralelo → selado, com código e PDF final', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  const r1 = await assinarComo(amb, SIGNATARIOS[0].email, 'maria exemplo souza')
  assert.equal(r1.contrato_status, 'parcialmente_assinado')
  const r2 = await assinarComo(amb, SIGNATARIOS[1].email, 'JOÃO DA SILVA EXEMPLO')
  assert.equal(r2.contrato_status, 'assinado')

  const consulta = amb.servico.consultar(c.id, 'org1')
  assert.match(consulta.codigo_verificacao, /^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/)
  assert.ok(consulta.pdf_final_sha256 && consulta.pdf_final_sha256 !== consulta.pdf_original_sha256)
  assert.equal(consulta.conteudo_sha256, c.conteudo_sha256, 'o conteúdo assinado é o gerado')

  const final = amb.servico.arquivo(c.id, 'org1', 'final')
  assert.equal(final.buffer.subarray(0, 5).toString(), '%PDF-')

  const d = amb.servico.dossie(c.id, 'org1')
  assert.ok(d.integridade.trilha.integra)
  const tipos = d.eventos.map(e => e.tipo)
  for (const t of ['contrato.gerado', 'contrato.enviado', 'otp.validado', 'clausula.ciencia', 'documento.lido_ate_o_fim', 'assinatura.aceita', 'documento.selado']) {
    assert.ok(tipos.includes(t), `faltou o evento ${t}`)
  }
  assert.equal(amb.caixa.filter(m => m.meta.tipo === 'concluido').length, 2, 'todos recebem o aviso de conclusão')
})

test('não assina sem ciência em todas as cláusulas críticas', async () => {
  const amb = ambiente()
  await preparar(amb)
  const email = SIGNATARIOS[1].email
  const token = amb.tokenDe(email)
  await amb.servico.solicitarCodigo(token, {})
  const { sessao } = amb.servico.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {})
  const criticas = amb.servico.conteudo(token, sessao).clausulas.filter(x => x.critica)
  amb.servico.darCiencia(token, sessao, criticas[0].chave, {}, {})
  amb.servico.registrarLeitura(token, sessao, {}, {})
  await assert.rejects(
    amb.servico.assinar(token, sessao, { nome_digitado: SIGNATARIOS[1].nome, concordo: true }, {}),
    e => e.status === 409 && e.detalhes.clausulas.length === criticas.length - 1,
  )
})

test('não assina sem ler até o fim, sem "concordo" ou com nome diferente', async () => {
  const amb = ambiente()
  await preparar(amb)
  const email = SIGNATARIOS[1].email
  const token = amb.tokenDe(email)
  await amb.servico.solicitarCodigo(token, {})
  const { sessao } = amb.servico.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {})
  for (const cl of amb.servico.conteudo(token, sessao).clausulas.filter(x => x.critica)) amb.servico.darCiencia(token, sessao, cl.chave, {}, {})
  const assinar = (o) => amb.servico.assinar(token, sessao, o, {})
  await assert.rejects(assinar({ nome_digitado: SIGNATARIOS[1].nome, concordo: true }), /até o fim/)
  amb.servico.registrarLeitura(token, sessao, {}, {})
  await assert.rejects(assinar({ nome_digitado: SIGNATARIOS[1].nome }), /concorda/)
  await assert.rejects(assinar({ nome_digitado: 'Outra Pessoa', concordo: true }), /nome completo/)
})

test('código: errado conta tentativa, esgota em 5, expira em 10 min e tem intervalo para reenviar', async () => {
  const amb = ambiente()
  await preparar(amb)
  const email = SIGNATARIOS[1].email
  const token = amb.tokenDe(email)
  await amb.servico.solicitarCodigo(token, {})
  await assert.rejects(amb.servico.solicitarCodigo(token, {}), e => e.status === 429)
  const certo = amb.ultima(email, 'codigo').meta.codigo
  const errado = certo === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++) assert.throws(() => amb.servico.validarCodigo(token, errado, {}), e => e.status === 400)
  assert.throws(() => amb.servico.validarCodigo(token, certo, {}), e => e.status === 429, 'esgotado, nem o certo passa')

  amb.relogio.avancar(61e3)
  await amb.servico.solicitarCodigo(token, {})
  amb.relogio.avancar(11 * 60e3)
  assert.throws(() => amb.servico.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {}), /expirou/)
})

test('sem sessão (só com o link) não se lê nem assina', async () => {
  const amb = ambiente()
  await preparar(amb)
  const token = amb.tokenDe(SIGNATARIOS[1].email)
  assert.throws(() => amb.servico.conteudo(token, null), e => e.status === 401)
  assert.throws(() => amb.servico.conteudo(token, 'inventada'), e => e.status === 401)
})

test('reenviar invalida o link anterior', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  const antigo = amb.tokenDe(SIGNATARIOS[1].email)
  const sid = amb.servico.consultar(c.id, 'org1').signatarios[1].id
  await amb.servico.reenviar(c.id, 'org1', sid)
  assert.throws(() => amb.servico.abrir(antigo), e => e.status === 404)
  assert.ok(amb.servico.abrir(amb.tokenDe(SIGNATARIOS[1].email)))
})

test('ordem sequencial: o segundo só recebe o link depois do primeiro assinar', async () => {
  const amb = ambiente()
  await preparar(amb, { ordem: 'sequencial' })
  assert.equal(amb.caixa.filter(m => m.meta.tipo === 'link').length, 1)
  assert.equal(amb.ultima(SIGNATARIOS[1].email, 'link'), undefined)
  await assinarComo(amb, SIGNATARIOS[0].email, SIGNATARIOS[0].nome)
  assert.ok(amb.ultima(SIGNATARIOS[1].email, 'link'))
})

test('recusa encerra o contrato para todos', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  const email = SIGNATARIOS[1].email
  const token = amb.tokenDe(email)
  await amb.servico.solicitarCodigo(token, {})
  const { sessao } = amb.servico.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {})
  assert.throws(() => amb.servico.recusar(token, sessao, { motivo: '' }, {}), /por que/)
  amb.servico.recusar(token, sessao, { motivo: 'valor diferente do combinado' }, {})
  assert.equal(amb.servico.consultar(c.id, 'org1').status, 'recusado')
  await assert.rejects(assinarComo(amb, SIGNATARIOS[0].email, SIGNATARIOS[0].nome), /recusado/)
})

test('prazo vencido expira o contrato', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  amb.relogio.avancar(31 * 864e5)
  const token = amb.tokenDe(SIGNATARIOS[0].email)
  assert.equal(amb.servico.abrir(token).contrato_status, 'expirado')
  await assert.rejects(amb.servico.solicitarCodigo(token, {}), /prazo/)
  assert.equal(amb.servico.consultar(c.id, 'org1').status, 'expirado')
  assert.ok(amb.servico.dossie(c.id, 'org1').eventos.some(e => e.tipo === 'contrato.expirado'))
})

test('verificação pública mascara dados pessoais e confere o arquivo', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  await assinarComo(amb, SIGNATARIOS[0].email, SIGNATARIOS[0].nome)
  await assinarComo(amb, SIGNATARIOS[1].email, SIGNATARIOS[1].nome)
  const { codigo_verificacao: codigo, pdf_final_sha256, pdf_original_sha256 } = amb.servico.consultar(c.id, 'org1')

  const v = amb.servico.verificar(codigo.toLowerCase().replace(/-/g, ' '))
  assert.equal(v.status, 'assinado')
  assert.ok(v.integridade.trilha_integra)
  const joao = v.signatarios.find(s => s.nome.startsWith('João'))
  assert.equal(joao.nome, 'João S. E.')
  assert.equal(joao.cpf, '***.982.247-**')
  assert.ok(!JSON.stringify(v).includes('prestador-exemplo'), 'e-mail não aparece')
  assert.ok(!JSON.stringify(v).includes('2.350'), 'valor do contrato não aparece')

  assert.equal(amb.servico.conferirHash(codigo, pdf_final_sha256).confere, 'final')
  assert.equal(amb.servico.conferirHash(codigo, pdf_original_sha256).confere, 'original')
  assert.equal(amb.servico.conferirHash(codigo, 'f'.repeat(64)).confere, null)
  assert.equal(amb.servico.verificar('AAAA-BBBB-CCCC'), null)
})

test('trilha: adulterar, remover ou reordenar evento é detectado', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  await assinarComo(amb, SIGNATARIOS[0].email, SIGNATARIOS[0].nome)
  const eventos = amb.servico.trilha.listar(c.id)
  assert.ok(verificarTrilha(eventos).integra)

  const alterado = structuredClone(eventos)
  alterado[3].dados = { mexido: true }
  assert.equal(verificarTrilha(alterado).quebra_em, 4)

  const semUm = eventos.filter((_, i) => i !== 2)
  assert.equal(verificarTrilha(semUm).integra, false)

  assert.throws(() => amb.repo.atualizar('eventos', eventos[0].id, { tipo: 'x' }), /append-only/)
})

test('envio recusa e-mail sintético, repetido ou nome incompleto', async () => {
  const amb = ambiente()
  const { modelo, dados } = exemplo('pf-determinado')
  const c = await amb.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados })
  const enviar = (s) => amb.servico.enviar(c.id, 'org1', { signatarios: s })
  await assert.rejects(enviar([{ nome: 'Fulano Teste', email: 'fulano@exameqr.app' }]), /não é uma caixa/)
  await assert.rejects(enviar([{ nome: 'Fulano', email: 'f@exemplo.com.br' }]), /nome completo/)
  await assert.rejects(enviar([{ nome: 'A Um', email: 'a@x.com.br' }, { nome: 'B Dois', email: 'A@x.com.br' }]), /repetido/)
})

test('contrato com lacunas não é gerado', async () => {
  const amb = ambiente()
  const { modelo, dados } = exemplo('com-erros')
  await assert.rejects(amb.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados }), e => e.status === 422 && e.detalhes.invalidos.length > 0)
})

test('organização não enxerga contrato de outra', async () => {
  const amb = ambiente()
  const c = await preparar(amb)
  assert.throws(() => amb.servico.consultar(c.id, 'org2'), e => e.status === 404)
})
