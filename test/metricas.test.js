// Painel de leitura: funil, tempo por cláusula, dúvidas e recusas por
// cláusula, lista de recusas. E a recusa agora pode apontar a cláusula.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SENHA, subirServidor } from './apoio-http.js'

let A
const ADMIN = 'admin@org1.exemplo'
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

async function enviado(nome, email) {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome, email }] } })
  return c
}
async function entrar(email) {
  const token = A.caixa(email, 'link').meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(token, {})
  const { sessao } = A.servico.validarCodigo(token, A.caixa(email, 'codigo').meta.codigo, {})
  return { token, sessao }
}

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Maria Admin Souza', email: ADMIN, papel: 'org_admin', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Leo Leitor', email: 'leitor@org1.exemplo', papel: 'leitor', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ nome: 'Dev Plataforma', email: 'dev@plataforma.exemplo', papel: 'developer', senha: SENHA })

  // 1. Assina, com dúvida na autonomia e tempos de leitura.
  const c1 = await enviado('João da Silva Exemplo', 'joao@exemplo.com')
  const a = await entrar('joao@exemplo.com')
  A.servico.perguntar(a.token, a.sessao, { clausula: 'autonomia', pergunta: 'Posso atender outras clínicas?' }, {})
  const conteudo = A.servico.conteudo(a.token, a.sessao)
  for (const cl of conteudo.clausulas.filter(x => x.critica)) A.servico.darCiencia(a.token, a.sessao, cl.chave, { tempo_leitura_ms: 20_000 }, {})
  A.servico.registrarLeitura(a.token, a.sessao, { tempos: { autonomia: 45_000, multa_rescisoria: 12_000, objeto: 5_000, foro: 3_000 } }, {})
  await A.servico.assinar(a.token, a.sessao, { nome_digitado: 'João da Silva Exemplo', concordo: true }, {})
  // 2. Recusa apontando a multa, pelo HTTP.
  await enviado('Ana Souza Lima', 'ana@exemplo.com')
  const b = await entrar('ana@exemplo.com')
  A.servico.registrarLeitura(b.token, b.sessao, { tempos: { multa_rescisoria: 90_000 } }, {})
  const r = await A.json(await A.api(`/api/assinar/${b.token}/recusar`, { chave: null, sessao: b.sessao, metodo: 'POST', corpo: { motivo: 'A multa de 20% é alta demais para mim.', clausula: 'multa_rescisoria' } }))
  assert.equal(r.status, 200, JSON.stringify(r.corpo))
  // 3. Enviado e nunca aberto.
  await enviado('Carlos Pereira Dias', 'carlos@exemplo.com')
  void c1
})
after(() => A.fechar())

test('recusa com cláusula apontada: fica no signatário, na trilha e no aviso à organização', async () => {
  const c = (await A.json(await A.api('/v1/contratos?status=recusado'))).corpo.itens[0]
  const det = (await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo
  assert.deepEqual(det.signatarios[0].recusa_clausula, { chave: 'multa_rescisoria', numero: 11, titulo: 'Da multa por resilição antecipada' })
  const ev = det.eventos.find(e => e.tipo === 'assinatura.recusada')
  assert.equal(ev.dados.clausula, 'multa_rescisoria')
  await A.avisos.aguardar()
  const aviso = A.caixa(ADMIN, 'aviso.contrato.recusado')
  assert.match(aviso.texto, /Cláusula apontada: 11 \(Da multa por resilição antecipada\)/)
})

test('métricas da organização: funil, cláusulas com dúvida e recusa no topo, tempos, lista de recusas', async () => {
  const { status, corpo: m } = await A.json(await A.api('/v1/metricas?dias=30'))
  assert.equal(status, 200)
  assert.deepEqual({ enviados: m.contratos.enviados, assinados: m.contratos.assinados, recusados: m.contratos.recusados, em_andamento: m.contratos.em_andamento }, { enviados: 3, assinados: 1, recusados: 1, em_andamento: 1 })
  const f = m.signatarios
  assert.deepEqual([f.receberam, f.abriram, f.confirmaram, f.leram, f.assinaram, f.recusaram, f.pendentes, f.expiraram], [3, 2, 2, 2, 1, 1, 1, 0])
  assert.ok(m.contratos.horas_ate_assinar_mediana != null)
  assert.equal(m.duvidas.total, 1)
  assert.equal(m.duvidas.sem_resposta, 1)

  const topo = m.clausulas.slice(0, 2).map(x => x.clausula).sort()
  assert.deepEqual(topo, ['autonomia', 'multa_rescisoria'], 'dúvida e recusa sobem')
  const multa = m.clausulas.find(x => x.clausula === 'multa_rescisoria')
  assert.equal(multa.recusas, 1)
  assert.equal(multa.ciencias, 1)
  assert.equal(multa.leituras, 2)
  assert.equal(multa.segundos_mediana, 51, 'mediana de 12 s e 90 s')
  assert.equal(multa.critica, true)
  const autonomia = m.clausulas.find(x => x.clausula === 'autonomia')
  assert.equal(autonomia.duvidas, 1)
  assert.equal(autonomia.segundos_mediana, 45)
  const objeto = m.clausulas.find(x => x.clausula === 'objeto')
  assert.equal(objeto.ciencias, 0)
  assert.equal(objeto.contratos, 3)

  assert.equal(m.recusas.length, 1)
  assert.equal(m.recusas[0].signatario, 'Ana Souza Lima')
  assert.equal(m.recusas[0].clausula.numero, 11)
  assert.match(m.recusas[0].motivo, /alta demais/)
  assert.deepEqual(m.modelos.map(x => [x.chave, x.contratos]), [['prestacao_servicos', 3]])
})

test('painel: leitor consulta; plataforma vê todas as organizações ou uma; a demonstração do site fica de fora por padrão', async () => {
  const leitor = await A.entrar('leitor@org1.exemplo')
  const r = await A.json(await A.api('/painel/api/org/metricas?dias=90', { chave: null, cookie: leitor }))
  assert.equal(r.status, 200)
  assert.equal(r.corpo.contratos.enviados, 3)

  await A.json(await A.api('/api/demo/pedir', { chave: null, metodo: 'POST', corpo: { nome: 'Visitante Do Site', email: 'visitante@site.exemplo' } }))
  const dev = await A.entrar('dev@plataforma.exemplo')
  const todas = (await A.json(await A.api('/painel/api/plataforma/metricas?dias=90', { chave: null, cookie: dev }))).corpo
  assert.equal(todas.contratos.enviados, 3, 'demonstração fora')
  const demo = (await A.json(await A.api('/painel/api/plataforma/metricas?dias=90&organizacao=demonstracao', { chave: null, cookie: dev }))).corpo
  assert.equal(demo.contratos.enviados, 1)
  const org1 = (await A.json(await A.api('/painel/api/plataforma/metricas?dias=90&organizacao=org1&modelo=prestacao_servicos', { chave: null, cookie: dev }))).corpo
  assert.equal(org1.contratos.enviados, 3)
  assert.equal((await A.api('/painel/api/plataforma/metricas', { chave: null, cookie: leitor })).status, 403)
})
