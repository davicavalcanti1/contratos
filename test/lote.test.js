import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { carregarBiblioteca } from '../src/biblioteca.js'
import { criarLotes } from '../src/lote/lotes.js'
import { sugerirMapeamento } from '../src/lote/mapear.js'
import { decodificar, lerCsv, lerPlanilha } from '../src/lote/planilha.js'

const bib = carregarBiblioteca()
const organizacao = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))
const TERMO = 'termo_confidencialidade_colaborador'

// CPF válido a partir de 9 dígitos (para montar planilhas de teste).
function cpf(base9) {
  const d = base9.split('').map(Number)
  for (const n of [9, 10]) {
    const s = d.slice(0, n).reduce((a, x, i) => a + x * (n + 1 - i), 0)
    d.push(((s * 10) % 11) % 10)
  }
  return d.join('')
}

function ambiente() {
  const repo = criarRepo()
  const caixa = []
  const servico = criarServico({ repo, biblioteca: bib, notificar: async (m) => caixa.push(m) })
  const lotes = criarLotes({ repo, biblioteca: bib, servico })
  const ultima = (para, tipo) => caixa.filter(m => m.para === para && m.meta.tipo === tipo).at(-1)
  return { repo, caixa, servico, lotes, ultima }
}

// A planilha como o Excel brasileiro salva: Windows-1252, ";", CPF como número.
function planilhaRh() {
  const cpfZero = cpf('012345678') // começa com 0
  const linhas = [
    'Matrícula;Nome Completo;CPF;E-mail;Cargo',
    `1001;Ana Paula Conceição;${cpf('123456789')};ana.paula@empresa-exemplo.com.br;Recepcionista`,
    `1002;José Antônio Brandão;${cpfZero.replace(/^0/, '')};jose.brandao@empresa-exemplo.com.br;Técnico de radiologia`,
    `1003;Márcia Exemplo;123.456.789-00;marcia@empresa-exemplo.com.br;Enfermeira`,
    `1004;Fábio Sem Email;${cpf('987654321')};;Motorista`,
    '',
  ]
  return { buffer: Buffer.from(new TextEncoder().encode('')), texto: linhas.join('\r\n'), cpfZero }
}
const win1252 = (s) => Buffer.from([...s].map(ch => {
  const c = ch.charCodeAt(0)
  if (c < 256) return c
  throw new Error(`fora do latin1: ${ch}`)
}))

test('CSV em Windows-1252 com ";" é lido com acento certo', async () => {
  const { texto } = planilhaRh()
  const p = await lerPlanilha(win1252(texto), 'funcionarios.csv')
  assert.deepEqual(p.colunas, ['Matrícula', 'Nome Completo', 'CPF', 'E-mail', 'Cargo'])
  assert.equal(p.linhas.length, 4)
  assert.equal(p.linhas[1].valores['Nome Completo'], 'José Antônio Brandão')
  assert.equal(p.linhas[0].numero, 2, 'número da linha como no Excel')
})

test('CSV: aspas com separador e quebra de linha dentro', () => {
  const l = lerCsv('a;b\n"x;y";"linha 1\nlinha 2"\n')
  assert.deepEqual(l[1], ['x;y', 'linha 1\nlinha 2'])
  assert.equal(decodificar(Buffer.from('﻿ok')), 'ok')
})

test('XLSX: data, número e texto chegam como texto utilizável', async () => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Funcionários')
  ws.addRow(['Nome', 'CPF', 'Admissão', 'Salário'])
  ws.addRow(['Ana Paula Conceição', Number(cpf('123456789')), new Date(Date.UTC(2026, 10, 1)), 2350.5])
  const p = await lerPlanilha(Buffer.from(await wb.xlsx.writeBuffer()), 'func.xlsx')
  assert.deepEqual(p.linhas[0].valores, { Nome: 'Ana Paula Conceição', CPF: cpf('123456789'), 'Admissão': '2026-11-01', 'Salário': '2350.5' })
})

test('sugestão de mapeamento casa as colunas do RH com o modelo', () => {
  const m = sugerirMapeamento(['Matrícula', 'Nome Completo', 'CPF', 'E-mail', 'Cargo'], bib.modelos.find(x => x.chave === TERMO))
  assert.deepEqual(m['colaborador.nome'], { coluna: 'Nome Completo' })
  assert.deepEqual(m['colaborador.cpf'], { coluna: 'CPF' })
  assert.deepEqual(m['colaborador.email'], { coluna: 'E-mail' })
  assert.deepEqual(m['colaborador.cargo'], { coluna: 'Cargo' })
  assert.deepEqual(m['colaborador.matricula'], { coluna: 'Matrícula' })
})

test('mapeamento de PJ não confunde CPF do representante com CPF do contratado', () => {
  const m = sugerirMapeamento(['Razão social', 'CNPJ', 'CPF do representante', 'Representante legal', 'E-mail', 'Valor mensal'], bib.modelos.find(x => x.chave === 'prestacao_servicos'))
  assert.deepEqual(m['contratado.representante_cpf'], { coluna: 'CPF do representante' })
  assert.deepEqual(m['contratado.representante_nome'], { coluna: 'Representante legal' })
  assert.notDeepEqual(m['contratado.cpf'], { coluna: 'CPF do representante' })
  assert.deepEqual(m['contrato.valor'], { coluna: 'Valor mensal' })
})

async function subir(amb) {
  const p = await amb.lotes.receberPlanilha('org1', win1252(planilhaRh().texto), 'funcionarios.csv')
  const { mapeamento } = amb.lotes.sugerir('org1', p.planilha_id, TERMO)
  return { p, mapeamento }
}

test('prévia: 2 prontas, 2 com problema, e diz qual e por quê', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  const r = amb.lotes.previa('org1', organizacao, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento })
  assert.equal(r.prontas, 2)
  assert.equal(r.com_problema, 2)
  const l4 = r.linhas.find(l => l.numero === 4)
  assert.ok(l4.problemas.some(x => /CPF.*inválido/.test(x)))
  const l5 = r.linhas.find(l => l.numero === 5)
  assert.ok(l5.problemas.some(x => /e-mail/.test(x)))
  const l3 = r.linhas.find(l => l.numero === 3)
  assert.ok(l3.ok && l3.avisos.some(a => /zeros à esquerda/.test(a)), 'CPF sem zero foi restaurado e avisado')
})

test('organização com cadastro incompleto trava o lote todo, com o motivo', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  const semDpo = { ...organizacao, encarregado_email: '' }
  const r = amb.lotes.previa('org1', semDpo, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento })
  assert.deepEqual(r.cadastro_da_organizacao_incompleto, ['e-mail do encarregado de dados (DPO)'])
  await assert.rejects(amb.lotes.criar('org1', semDpo, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento }), /cadastro da organização/)
})

test('lote ponta a ponta: gera, representante assina todos de uma vez, colaboradores assinam, selo', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  const assinante = { nome: 'Maria Exemplo Souza', email: 'maria.diretora@empresa-exemplo.com.br' }
  const lote = await amb.lotes.criar('org1', organizacao, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento, nome: 'Termos outubro', assinante_organizacao: assinante })

  assert.equal(lote.totais.contratos, 2)
  assert.equal(lote.totais.nao_geradas, 2)
  assert.equal(amb.repo.listar('planilhas').length, 0, 'planilha apagada depois do lote (LGPD)')
  assert.equal(amb.caixa.filter(m => m.para === assinante.email && m.meta.tipo === 'link').length, 0, 'representante não recebe um link por contrato')
  const linkLote = amb.ultima(assinante.email, 'link_lote').meta.link
  const tokenLote = linkLote.split('/lote/')[1]

  // Representante
  const s = amb.servico
  assert.equal(s.abrirLote(tokenLote).pendentes, 2)
  await s.solicitarCodigoLote(tokenLote, {})
  const { sessao } = s.validarCodigoLote(tokenLote, amb.ultima(assinante.email, 'codigo').meta.codigo, {})
  const cont = s.conteudoLote(tokenLote, sessao)
  assert.ok(cont.clausulas[0].paragrafos[1].texto.includes('«nome do colaborador»'), 'vê o modelo, com variáveis rotuladas')
  assert.equal(cont.contratos.length, 2)
  assert.ok(cont.contratos[0].resumo.some(r => r.valor === 'Ana Paula Conceição'))
  const matricula = cont.clausulas[0].paragrafos.find(x => x.condicao)
  assert.equal(matricula.condicao, 'houver matrícula')

  await assert.rejects(s.assinarLote(tokenLote, sessao, { nome_digitado: assinante.nome, concordo: true }, {}), /Confirme a leitura/)
  for (const cl of cont.clausulas.filter(c => c.critica)) s.darCienciaLote(tokenLote, sessao, cl.chave, { tempo_leitura_ms: 3000 }, {})
  await assert.rejects(s.assinarLote(tokenLote, sessao, { nome_digitado: assinante.nome, concordo: true }, {}), /até o fim/)
  s.registrarLeituraLote(tokenLote, sessao, {}, {})
  const r = await s.assinarLote(tokenLote, sessao, { nome_digitado: 'maria exemplo souza', concordo: true }, { ip: '10.0.0.1' })
  assert.equal(r.assinados, 2)
  await assert.rejects(s.assinarLote(tokenLote, sessao, { nome_digitado: assinante.nome, concordo: true }, {}), /Não há contrato pendente/)

  let prog = amb.lotes.progresso('org1', lote.id)
  assert.equal(prog.totais.assinados, 0, 'falta o colaborador')
  assert.ok(prog.linhas.filter(l => l.contrato_id).every(l => l.empresa === 'assinado'))

  // Colaboradores assinam pelo link próprio
  for (const l of prog.linhas.filter(l => l.contrato_id)) {
    const email = l.pessoas[0].email
    const token = amb.ultima(email, 'link').meta.link.split('/assinar/')[1]
    await s.solicitarCodigo(token, {})
    const { sessao: ss } = s.validarCodigo(token, amb.ultima(email, 'codigo').meta.codigo, {})
    for (const cl of s.conteudo(token, ss).clausulas.filter(c => c.critica)) s.darCiencia(token, ss, cl.chave, {}, {})
    s.registrarLeitura(token, ss, {}, {})
    await s.assinar(token, ss, { nome_digitado: l.pessoas[0].nome, concordo: true }, {})
  }
  prog = amb.lotes.progresso('org1', lote.id)
  assert.equal(prog.totais.assinados, 2)
  assert.ok(prog.linhas.filter(l => l.contrato_id).every(l => l.codigo_verificacao))

  // O dossiê de cada contrato conta a assinatura da empresa sozinho.
  const d = s.dossie(prog.linhas.find(l => l.contrato_id).contrato_id, 'org1')
  assert.ok(d.integridade.trilha.integra)
  const aceita = d.eventos.filter(e => e.tipo === 'assinatura.aceita').find(e => e.dados.metodo === 'otp_email_lote')
  assert.equal(aceita.dados.via_lote, lote.id)
  assert.equal(aceita.dados.contratos_assinados_juntos, 2)
  assert.ok(d.eventos.some(e => e.tipo === 'clausula.ciencia' && e.dados.via_lote === lote.id))
})

test('relatório CSV abre no Excel (BOM, ";") e lembrete reenvia só a quem falta', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  const lote = await amb.lotes.criar('org1', organizacao, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento })
  const csv = amb.lotes.relatorioCsv('org1', lote.id)
  assert.ok(csv.startsWith('﻿Linha;'))
  assert.match(csv, /Ana Paula Conceição/)
  assert.match(csv, /não gerado/)
  const antes = amb.caixa.filter(m => m.meta.tipo === 'link').length
  const r = await amb.lotes.lembrar('org1', lote.id)
  assert.equal(r.lembretes_enviados, 2)
  assert.equal(amb.caixa.filter(m => m.meta.tipo === 'link').length, antes + 2)
})

test('mapeamento confirmado é lembrado no próximo lote com as mesmas colunas', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  mapeamento['colaborador.matricula'] = null // a pessoa desmarcou a matrícula
  await amb.lotes.criar('org1', organizacao, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento })
  const p2 = await amb.lotes.receberPlanilha('org1', win1252(planilhaRh().texto), 'funcionarios-novembro.csv')
  const s = amb.lotes.sugerir('org1', p2.planilha_id, TERMO)
  assert.equal(s.origem, 'salvo')
  assert.equal(s.mapeamento['colaborador.matricula'], null)
})

test('lote e planilha de uma organização não aparecem para outra', async () => {
  const amb = ambiente()
  const { p, mapeamento } = await subir(amb)
  assert.throws(() => amb.lotes.sugerir('org2', p.planilha_id, TERMO), e => e.status === 404)
  const lote = await amb.lotes.criar('org1', organizacao, { planilha_id: p.planilha_id, modelo: TERMO, mapeamento })
  assert.throws(() => amb.lotes.progresso('org2', lote.id), e => e.status === 404)
  assert.equal(amb.lotes.listar('org2').length, 0)
})
