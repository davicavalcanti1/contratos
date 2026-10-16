import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { criarVerificadorIcp } from '../src/plugaveis/icp.js'
import { assinarPdf, criarIcpDeTeste } from './apoio-icp.js'
import { subirServidor } from './apoio-http.js'

const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

// ACT falsa: responde o que o carimbador real devolve. A conversa RFC 3161 de
// verdade (com FreeTSA e DigiCert, e conferida no openssl) está documentada
// em docs/PLUGAVEIS.md; aqui interessa o encaixe no fluxo.
function actFalsa() {
  let fora = false
  const pedidos = []
  return {
    pedidos,
    derrubar: (v) => { fora = v },
    carimbador: {
      nome: 'ACT de teste',
      async carimbar(hash) {
        pedidos.push(hash)
        if (fora) throw new Error('A ACT ACT de teste não respondeu (tempo esgotado).')
        return { act: 'ACT de teste', icp_brasil: false, gen_time: '2026-10-16T21:00:00.000Z', serial: 'abc123', politica: '1.2.3', hash_algoritmo: 'SHA-256', hash, certificado_act: 'CN=ACT de teste', token_base64: Buffer.from(`tsr:${hash}`).toString('base64') }
      },
    },
  }
}

let A, act, icpTeste
before(async () => {
  act = actFalsa()
  icpTeste = await criarIcpDeTeste({ cpf: '52998224725', nomeTitular: 'JOAO DA SILVA EXEMPLO:52998224725' })
  A = await subirServidor({ carimbador: act.carimbador, icp: criarVerificadorIcp({ raizes: [icpTeste.raizX509] }) })
})
after(() => A.fechar())

async function abrirSessaoDe(email, contratoId) {
  const token = A.repo.listar('caixa', m => m.para === email && m.meta.tipo === 'link' && m.meta.contrato_id === contratoId).at(-1).meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(token, {})
  const { sessao } = A.servico.validarCodigo(token, A.caixa(email, 'codigo').meta.codigo, {})
  for (const cl of A.servico.conteudo(token, sessao).clausulas.filter(c => c.critica)) A.servico.darCiencia(token, sessao, cl.chave, {}, {})
  A.servico.registrarLeitura(token, sessao, {}, {})
  return { token, sessao }
}

async function gerarEEnviar(signatarios) {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  const r = await A.json(await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios } }))
  return { c, r }
}

// ── Carimbo do tempo ─────────────────────────────────────────────────────────

test('ao selar, o PDF assinado é carimbado; o .tsr sai no dossiê e o selo mostra a ACT', async () => {
  const { c } = await gerarEEnviar([{ nome: 'Ana Exemplo Design', email: 'ana.carimbo@exemplo.com.br' }])
  const { token, sessao } = await abrirSessaoDe('ana.carimbo@exemplo.com.br', c.id)
  await A.servico.assinar(token, sessao, { nome_digitado: 'Ana Exemplo Design', concordo: true }, {})
  await A.servico.aguardarCarimbos()

  const consulta = (await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo
  assert.equal(act.pedidos.at(-1), consulta.pdf_final_sha256, 'carimba o hash do PDF FINAL')
  const d = (await A.json(await A.api(`/v1/contratos/${c.id}/dossie`))).corpo
  assert.equal(d.integridade.carimbo_do_tempo.act, 'ACT de teste')
  assert.equal(d.integridade.carimbo_do_tempo.icp_brasil, false)
  assert.ok(d.eventos.some(e => e.tipo === 'documento.carimbado'))
  const tsr = await A.api(`/v1/contratos/${c.id}/carimbo.tsr`)
  assert.equal(tsr.headers.get('content-type'), 'application/timestamp-reply')
  assert.equal(Buffer.from(await tsr.arrayBuffer()).toString(), `tsr:${consulta.pdf_final_sha256}`)
  assert.equal(A.servico.verificar(consulta.codigo_verificacao).integridade.carimbo.act, 'ACT de teste')
})

test('ACT fora do ar não trava a assinatura: carimbo fica pendente e sai na próxima tentativa', async () => {
  act.derrubar(true)
  const { c } = await gerarEEnviar([{ nome: 'Bia Exemplo Pendente', email: 'bia.pendente@exemplo.com.br' }])
  const { token, sessao } = await abrirSessaoDe('bia.pendente@exemplo.com.br', c.id)
  const r = await A.servico.assinar(token, sessao, { nome_digitado: 'Bia Exemplo Pendente', concordo: true }, {})
  assert.equal(r.contrato_status, 'assinado', 'assinou e selou mesmo sem ACT')
  await A.servico.aguardarCarimbos()
  let d = (await A.json(await A.api(`/v1/contratos/${c.id}/dossie`))).corpo
  assert.equal(d.integridade.carimbo_do_tempo.pendente, true)
  assert.equal((await A.api(`/v1/contratos/${c.id}/carimbo.tsr`)).status, 404)

  act.derrubar(false)
  await A.servico.carimbarPendentes()
  d = (await A.json(await A.api(`/v1/contratos/${c.id}/dossie`))).corpo
  assert.equal(d.integridade.carimbo_do_tempo.act, 'ACT de teste')
})

// ── ICP-Brasil ───────────────────────────────────────────────────────────────

test('método ICP exige CPF no envio', async () => {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  const r = await A.json(await A.api(`/v1/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao.semcpf@exemplo.com.br', metodo: 'icp' }] } }))
  assert.equal(r.status, 400)
  assert.match(r.corpo.erro, /exige o CPF/)
})

test('assinatura ICP-Brasil ponta a ponta: lê com a bula, baixa, assina com certificado, envia; o selo registra o certificado', async () => {
  const email = 'joao.icp@exemplo.com.br'
  const { c } = await gerarEEnviar([{ nome: 'João da Silva Exemplo', email, cpf: '529.982.247-25', metodo: 'icp' }])
  const { token, sessao } = await abrirSessaoDe(email, c.id)
  assert.equal(A.servico.conteudo(token, sessao).signatario.metodo, 'icp')
  await assert.rejects(A.servico.assinar(token, sessao, { nome_digitado: 'João da Silva Exemplo', concordo: true }, {}), /certificado digital ICP-Brasil/)

  // Baixa o PDF pelo próprio link (como faria no navegador), assina e envia.
  const base = `/api/assinar/${token}`
  const original = Buffer.from(await (await A.api(`${base}/arquivo?qual=original`, { chave: null, sessao })).arrayBuffer())
  const assinado = await assinarPdf(original, icpTeste)
  const r = await A.json(await fetch(`${A.base}${base}/icp`, { method: 'POST', headers: { 'x-sessao': sessao, 'content-type': 'application/pdf' }, body: assinado }))
  assert.equal(r.status, 200, JSON.stringify(r.corpo))
  assert.equal(r.corpo.contrato_status, 'assinado')

  const consulta = (await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo
  const sig = consulta.signatarios[0]
  assert.equal(sig.metodo, 'icp')
  assert.equal(sig.certificado.nome, 'JOAO DA SILVA EXEMPLO:52998224725')
  const guardado = Buffer.from(await (await A.api(`/v1/contratos/${c.id}/assinaturas/${sig.id}/arquivo`)).arrayBuffer())
  assert.ok(guardado.equals(assinado), 'o arquivo assinado é guardado byte a byte')
  const d = (await A.json(await A.api(`/v1/contratos/${c.id}/dossie`))).corpo
  const aceita = d.eventos.find(e => e.tipo === 'assinatura.aceita')
  assert.equal(aceita.dados.metodo, 'icp_brasil')
  assert.equal(aceita.dados.arquivo_sha256, createHash('sha256').update(assinado).digest('hex'))
  assert.ok(d.signatarios[0].ciencias && Object.keys(d.signatarios[0].ciencias).length > 0, 'a bula vale também para quem assina com certificado')
})

test('ICP: certificado de outra pessoa, contrato editado e PDF sem assinatura são recusados com o motivo', async () => {
  const email = 'maria.icp@exemplo.com.br'
  const { c } = await gerarEEnviar([{ nome: 'Maria Exemplo Souza', email, cpf: '111.444.777-35', metodo: 'icp' }])
  const { token, sessao } = await abrirSessaoDe(email, c.id)
  const base = `${A.base}/api/assinar/${token}`
  const original = Buffer.from(await (await A.api(`/api/assinar/${token}/arquivo?qual=original`, { chave: null, sessao })).arrayBuffer())
  const enviar = async (buf) => A.json(await fetch(`${base}/icp`, { method: 'POST', headers: { 'x-sessao': sessao, 'content-type': 'application/pdf' }, body: buf }))

  // certificado é do João, não da Maria
  let r = await enviar(await assinarPdf(original, icpTeste))
  assert.equal(r.status, 422)
  assert.match(r.corpo.erro, /outra pessoa/)
  // contrato editado antes de assinar
  const editado = Buffer.from(original); editado[300] ^= 1
  r = await enviar(await assinarPdf(editado, icpTeste))
  assert.equal(r.status, 422)
  assert.match(r.corpo.erro, /não é o contrato enviado/)
  // sem assinatura
  r = await enviar(original)
  assert.equal(r.status, 422)
  assert.match(r.corpo.erro, /não tem assinatura/)
  assert.equal((await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo.status, 'enviado', 'nada foi assinado')
  assert.ok(A.servico.dossie(c.id, 'org1').eventos.filter(e => e.tipo === 'icp.recusado').length >= 3, 'as tentativas recusadas ficam na trilha')
})
