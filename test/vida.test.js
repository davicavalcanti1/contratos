import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { criarAgenda } from '../src/vida/agenda.js'
import { criarIndices, periodoPadrao } from '../src/vida/indices.js'
import { alertasDevidos, calcularVida, proximoReajuste, somarMeses } from '../src/vida/vida.js'

const bib = carregarBiblioteca()
const PRESTACAO = acharModelo(bib, 'prestacao_servicos')
const organizacao = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

// ── Datas e vigência (funções puras) ─────────────────────────────────────────

test('somar meses respeita o fim do mês e o ano bissexto', () => {
  assert.equal(somarMeses('2027-01-31', 1), '2027-02-28')
  assert.equal(somarMeses('2028-01-31', 1), '2028-02-29')
  assert.equal(somarMeses('2026-11-01', 12), '2027-11-01')
})

test('vigência: 12 meses a partir de 01/11/2026 termina em 31/10/2027, com reajuste anual', () => {
  const v = calcularVida(PRESTACAO, { contrato: { data_inicio: '2026-11-01', prazo_tipo: 'determinado', duracao_meses: 12, valor: '2.350,00', aviso_previo_dias: 30, indice_reajuste: 'IPCA' } })
  assert.equal(v.fim, '2027-10-31')
  assert.equal(v.valor, 2350)
  assert.deepEqual(v.reajuste, { a_cada_meses: 12 })
  // o primeiro aniversário cai depois do fim: dentro desta vigência não há reajuste
  assert.equal(proximoReajuste(v, '2027-06-01'), null)
})

test('vigência: prazo indeterminado não tem fim e reajusta todo ano; 3 meses não reajusta', () => {
  const ind = calcularVida(PRESTACAO, { contrato: { data_inicio: '01/11/2026', prazo_tipo: 'indeterminado', valor: 8900, indice_reajuste: 'IGP-M' } })
  assert.equal(ind.fim, null)
  assert.equal(proximoReajuste(ind, '2027-06-01'), '2027-11-01')
  assert.equal(proximoReajuste(ind, '2027-11-02'), '2028-11-01')
  const curto = calcularVida(PRESTACAO, { contrato: { data_inicio: '2026-11-01', prazo_tipo: 'determinado', duracao_meses: 3, valor: 4500 } })
  assert.equal(curto.fim, '2027-01-31')
  assert.equal(curto.reajuste, null)
})

test('alertas: 30 e 7 dias antes, um de cada vez; depois do fim, encerrado; reajuste 30 dias antes', () => {
  const v = { inicio: '2026-11-01', fim: '2027-10-31', reajuste: null }
  assert.deepEqual(alertasDevidos(v, '2027-09-20'), [])
  assert.equal(alertasDevidos(v, '2027-10-01')[0].chave, 'vencendo:2027-10-31:30')
  assert.equal(alertasDevidos(v, '2027-10-26')[0].chave, 'vencendo:2027-10-31:7', 'quem entra com 5 dias recebe o de 7, não o de 30')
  assert.equal(alertasDevidos(v, '2027-11-01')[0].tipo, 'encerrado')
  const ind = { inicio: '2026-11-01', fim: null, reajuste: { a_cada_meses: 12 } }
  assert.deepEqual(alertasDevidos(ind, '2027-10-02').map(a => a.chave), ['reajuste:2027-11-01'])
  assert.deepEqual(alertasDevidos(ind, '2027-09-30'), [])
})

// ── Índices (Banco Central) ──────────────────────────────────────────────────

test('índice acumulado é composto, cita a fonte e avisa mês ainda não publicado', async () => {
  const urls = []
  const indices = criarIndices({
    fetchFn: async (url) => {
      urls.push(url)
      return new Response(JSON.stringify([{ data: '01/01/2027', valor: '1.00' }, { data: '01/02/2027', valor: '2.00' }]), { status: 200 })
    },
  })
  const r = await indices.acumulado('IPCA', '2027-01', '2027-03')
  assert.equal(r.acumulado_pct, 3.02) // 1,01 × 1,02 − 1
  assert.match(urls[0], /bcdata\.sgs\.433\/dados\?formato=json&dataInicial=01\/01\/2027&dataFinal=31\/03\/2027/)
  assert.match(r.fonte, /Banco Central.*433.*IPCA/)
  assert.match(r.aviso, /2 de 3 meses/)
  assert.deepEqual(periodoPadrao('2027-11-01'), { de: '2026-10', ate: '2027-09' })
})

test('índice: API fora do ar vira mensagem para digitar à mão; índice desconhecido é recusado', async () => {
  const indices = criarIndices({ fetchFn: async () => { throw new Error('ECONNRESET') } })
  await assert.rejects(indices.acumulado('IGP-M', '2027-01', '2027-12'), e => e.status === 503 && /à mão/.test(e.message))
  await assert.rejects(indices.acumulado('INPC', '2027-01', '2027-12'), e => e.status === 400)
})

// ── Ciclo completo com relógio controlado ────────────────────────────────────

function ambiente() {
  let t = new Date('2026-10-20T15:00:00Z').getTime()
  const relogio = { agora: () => new Date(t), ir: (iso) => { t = new Date(`${iso}T15:00:00Z`).getTime() } }
  const repo = criarRepo()
  const caixa = []
  const eventos = []
  const aoEvento = (org, tipo, dados) => eventos.push({ org, tipo, dados })
  const notificar = async (m) => caixa.push(m)
  const servico = criarServico({ repo, biblioteca: bib, notificar, agora: relogio.agora, aoEvento })
  const agenda = criarAgenda({ repo, servico, notificar, aoEvento, agora: relogio.agora })
  repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Ana Admin', email: 'ana.admin@clinica.exemplo', papel: 'org_admin', ativo: true })
  repo.inserir('usuarios', { organizacao_id: 'org1', nome: 'Leo Leitor', email: 'leo@clinica.exemplo', papel: 'leitor', ativo: true })
  return { relogio, repo, caixa, eventos, servico, agenda }
}

const SIG = [
  { nome: 'Maria Exemplo Souza', email: 'maria@clinica.exemplo', papel: 'representante' },
  { nome: 'João da Silva Exemplo', email: 'joao@prestador.exemplo', papel: 'parte' },
]

async function assinarTodos(A, contratoId) {
  for (const s of A.repo.listar('signatarios', x => x.contrato_id === contratoId)) {
    const token = A.caixa.filter(m => m.para === s.email && m.meta.tipo === 'link' && m.meta.contrato_id === contratoId).at(-1).meta.link.split('/assinar/')[1]
    await A.servico.solicitarCodigo(token, {})
    const codigo = A.caixa.filter(m => m.para === s.email && m.meta.tipo === 'codigo').at(-1).meta.codigo
    const { sessao } = A.servico.validarCodigo(token, codigo, {})
    for (const cl of A.servico.conteudo(token, sessao).clausulas.filter(c => c.critica)) A.servico.darCiencia(token, sessao, cl.chave, {}, {})
    A.servico.registrarLeitura(token, sessao, {}, {})
    await A.servico.assinar(token, sessao, { nome_digitado: s.nome, concordo: true }, {})
  }
}

async function contratoAssinado(A, nomeExemplo = 'pf-determinado') {
  const { modelo, dados } = exemplo(nomeExemplo)
  const c = await A.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados })
  await A.servico.enviar(c.id, 'org1', { signatarios: SIG })
  await assinarTodos(A, c.id)
  return A.servico.consultar(c.id, 'org1')
}

test('agenda: avisa 30 dias antes, uma vez só, por e-mail a quem administra e por webhook', async () => {
  const A = ambiente()
  const c = await contratoAssinado(A)
  assert.equal(c.vida.fim, '2027-10-31')
  A.relogio.ir('2027-10-01')
  const feitos = await A.agenda.executar()
  assert.deepEqual(feitos.map(f => f.chave), ['vencendo:2027-10-31:30'])
  assert.equal(A.eventos.filter(e => e.tipo === 'contrato.vencendo').length, 1)
  const emails = A.caixa.filter(m => m.meta.tipo === 'agenda.vencendo')
  assert.deepEqual(emails.map(m => m.para), ['ana.admin@clinica.exemplo'], 'leitor não recebe')
  assert.match(emails[0].texto, /termina em 31\/10\/2027/)
  assert.equal((await A.agenda.executar()).length, 0, 'rodar de novo no mesmo dia não repete')
  assert.equal(A.agenda.proximos('org1').vencimentos[0].dias, 30)
})

test('aditivo: prorroga e reajusta; ao ser assinado, a vigência do original muda e o selo conta', async () => {
  const A = ambiente()
  const o = await contratoAssinado(A)
  await assert.rejects(A.servico.gerarDerivado(o.id, 'org1', organizacao, 'aditivo', { vigencia: '2027-11-01' }), /ao menos uma mudança/)
  await assert.rejects(A.servico.gerarDerivado(o.id, 'org1', organizacao, 'aditivo', { vigencia: '2027-11-01', prorroga: true, nova_data_fim: '2027-06-30' }), /depois do término atual/)

  const ad = await A.servico.gerarDerivado(o.id, 'org1', organizacao, 'aditivo', {
    vigencia: '2027-11-01', prorroga: true, nova_data_fim: '2028-10-31',
    altera_valor: true, novo_valor: '2.450,30', motivo_valor: 'reajuste_indice', indice_texto: 'IPCA/IBGE de 10/2026 a 09/2027: 4,27%',
  })
  assert.equal(ad.origem.contrato_id, o.id)
  assert.equal(ad.signatarios.length, 2, 'mesmos signatários do original')
  await assert.rejects(A.servico.gerarDerivado(o.id, 'org1', organizacao, 'distrato', { data_encerramento: '2027-12-31', quitacao: 'total' }), /aguardando assinatura/)

  // O texto do aditivo copia a qualificação das partes do original, literalmente.
  const snapshot = A.repo.obter('contratos', ad.id).snapshot
  const txt = snapshot.clausulas.flatMap(c => c.paragrafos.map(p => p.texto)).join('\n')
  assert.match(txt, /CPF sob o nº 529\.982\.247-25/)
  assert.match(txt, /prorrogado até 31\/10\/2028/)
  assert.match(txt, /R\$\s2\.450,30 \(dois mil quatrocentos e cinquenta reais e trinta centavos\)/)
  assert.match(snapshot.titulo, /^Termo Aditivo ao Contrato de Prestação de Serviços$/)

  assert.equal(A.servico.consultar(o.id, 'org1').vida.fim, '2027-10-31', 'antes de assinar, nada muda')
  await assinarTodos(A, ad.id)
  const depois = A.servico.consultar(o.id, 'org1')
  assert.equal(depois.vida.fim, '2028-10-31')
  assert.equal(depois.vida.valor, 2450.3)
  assert.equal(depois.derivados[0].status, 'assinado')
  assert.ok(A.eventos.some(e => e.tipo === 'contrato.aditado'))
  assert.ok(A.servico.dossie(o.id, 'org1').eventos.some(e => e.tipo === 'contrato.aditado'), 'a trilha do original registra o aditivo')
  const selo = A.servico.verificar(depois.codigo_verificacao)
  assert.equal(selo.derivados[0].tipo, 'aditivo')
  assert.equal(selo.vigencia.fim, '2028-10-31')
  assert.equal(A.servico.verificar(depois.derivados[0].codigo_verificacao).origem.codigo, depois.codigo_verificacao)

  // Prorrogado, o contrato não encerra no fim antigo.
  A.relogio.ir('2027-11-05')
  assert.ok(!(await A.agenda.executar()).some(f => f.tipo === 'encerrado'))
  assert.equal(A.servico.consultar(o.id, 'org1').status, 'assinado')
})

test('distrato com data futura: o contrato vale até a data combinada e só então vira distratado', async () => {
  const A = ambiente()
  const o = await contratoAssinado(A)
  const d = await A.servico.gerarDerivado(o.id, 'org1', organizacao, 'distrato', { data_encerramento: '2027-03-31', quitacao: 'com_pendencias', pendencias: 'pagamento da mensalidade de março', dispensa_multa: true })
  const txt = A.repo.obter('contratos', d.id).snapshot.clausulas.flatMap(c => c.paragrafos.map(p => p.texto)).join('\n')
  assert.match(txt, /ressalvadas as seguintes pendências.*mensalidade de março/)
  assert.match(txt, /dispensada a multa/)
  await assinarTodos(A, d.id)

  // Assinado o distrato, o contrato continua valendo até 31/03/2027.
  let depois = A.servico.consultar(o.id, 'org1')
  assert.equal(depois.status, 'assinado')
  assert.equal(depois.vida.fim, '2027-03-31')
  assert.equal(depois.distrato.data_encerramento, '2027-03-31')
  assert.equal(A.servico.verificar(depois.codigo_verificacao).distrato.data_encerramento, '2027-03-31')
  await assert.rejects(A.servico.gerarDerivado(o.id, 'org1', organizacao, 'aditivo', { vigencia: '2027-01-01', altera_objeto: true, novo_objeto: 'x' }), /já tem distrato/)

  // Sem aviso de "vence em 7 dias" (o fim foi combinado), e na data vira distratado — não "encerrado".
  A.relogio.ir('2027-03-28')
  assert.equal((await A.agenda.executar()).filter(f => f.tipo === 'vencendo').length, 0)
  A.relogio.ir('2027-04-01')
  await A.agenda.executar()
  depois = A.servico.consultar(o.id, 'org1')
  assert.equal(depois.status, 'distratado')
  assert.equal(A.servico.verificar(depois.codigo_verificacao).status, 'distratado')
  assert.ok(A.eventos.some(e => e.tipo === 'contrato.distratado'))
  assert.ok(!A.eventos.some(e => e.tipo === 'contrato.encerrado'))
})

test('distrato com data de hoje (ou passada) encerra na assinatura', async () => {
  const A = ambiente()
  const o = await contratoAssinado(A)
  const d = await A.servico.gerarDerivado(o.id, 'org1', organizacao, 'distrato', { data_encerramento: '2026-10-20', quitacao: 'total' })
  await assinarTodos(A, d.id)
  assert.equal(A.servico.consultar(o.id, 'org1').status, 'distratado')
})

test('contrato que vence sem aditivo vira "encerrado" na agenda, e o selo mostra', async () => {
  const A = ambiente()
  const o = await contratoAssinado(A, 'mei-unica') // 3 meses: 01/11/2026 a 31/01/2027
  assert.equal(o.vida.fim, '2027-01-31')
  A.relogio.ir('2027-02-01')
  const feitos = await A.agenda.executar()
  assert.ok(feitos.some(f => f.tipo === 'encerrado'))
  const depois = A.servico.consultar(o.id, 'org1')
  assert.equal(depois.status, 'encerrado')
  assert.ok(A.servico.verificar(depois.codigo_verificacao).encerrado_em)
  assert.ok(A.eventos.some(e => e.tipo === 'contrato.encerrado'))
  assert.equal(A.agenda.proximos('org1').encerrados[0].status, 'encerrado')
})

test('aditivo e distrato não podem ser gerados sozinhos nem de contrato não assinado', async () => {
  const A = ambiente()
  await assert.rejects(A.servico.gerar({ organizacaoId: 'org1', organizacao, modelo: 'distrato', dados: {} }), /a partir de um contrato assinado/)
  const { modelo, dados } = exemplo('pf-determinado')
  const c = await A.servico.gerar({ organizacaoId: 'org1', organizacao, modelo, dados })
  await assert.rejects(A.servico.gerarDerivado(c.id, 'org1', organizacao, 'aditivo', { vigencia: '2027-01-01', altera_objeto: true, novo_objeto: 'x' }), e => e.status === 409)
})

test('índice: a API do BCB é intermitente; 502 na primeira tentativa e sucesso na segunda funciona', async () => {
  let n = 0
  const indices = criarIndices({
    fetchFn: async () => (++n === 1 ? new Response('erro', { status: 502 }) : new Response(JSON.stringify([{ data: '01/01/2027', valor: '0.50' }]), { status: 200 })),
  })
  const r = await indices.acumulado('IPCA', '2027-01', '2027-01')
  assert.equal(n, 2)
  assert.equal(r.acumulado_pct, 0.5)
})
