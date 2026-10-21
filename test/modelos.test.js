// Página de modelos da organização: o modelo por dentro (texto com
// «campos» e condições, o que se preenche, quem assina) e o PDF de amostra.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SENHA, subirServidor } from './apoio-http.js'

let A
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => {
  A = await subirServidor()
  const { modelo, dados } = exemplo('pf-determinado')
  await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } })
})
after(() => A.fechar())

test('o modelo por dentro: texto com «campos» e condições, bula, o que se preenche, quem assina, contagens', async () => {
  const { status, corpo: m } = await A.json(await A.api('/v1/modelos/prestacao_servicos'))
  assert.equal(status, 200)
  assert.equal(m.titulo, 'Contrato de Prestação de Serviços')
  assert.equal(m.clausulas, 16)
  assert.equal(m.criticas, 5)
  assert.equal(m.contratos_gerados, 1)
  assert.equal(m.lote, true)
  assert.equal(m.vida, true)
  assert.equal(m.titulo_executivo, true)
  const partes = m.texto.clausulas[0]
  assert.match(partes.paragrafos[0].texto, /«razão social da contratante»/)
  assert.match(partes.paragrafos[1].condicao, /tipo do contratado é Pessoa física/)
  const prazoDet = m.texto.clausulas.find(c => c.chave === 'prazo_determinado')
  assert.match(prazoDet.condicao, /tipo de prazo é prazo determinado/)
  const autonomia = m.texto.clausulas.find(c => c.chave === 'autonomia')
  assert.equal(autonomia.critica, true)
  assert.match(autonomia.resumo, /por conta própria/)
  assert.ok(m.variaveis.some(v => v.chave === 'contrato.valor' && v.tipo === 'moeda' && v.obrigatoria === true))
  assert.ok(m.variaveis.some(v => v.chave === 'contrato.multa_percentual' && v.padrao === 20))
  assert.equal(m.signatarios_da_parte.length, 2)
  assert.match(m.signatarios_da_parte[1].condicao, /Pessoa jurídica/)
  assert.equal(m.signatarios_da_parte[0].nome, 'nome ou razão social do contratado')
})

test('aditivo e distrato não aparecem para a organização; modelo inexistente é 404', async () => {
  assert.equal((await A.api('/v1/modelos/termo_aditivo')).status, 404)
  assert.equal((await A.api('/v1/modelos/nao_existe')).status, 404)
  const lista = (await A.json(await A.api('/v1/modelos'))).corpo
  assert.ok(!lista.some(m => m.chave === 'termo_aditivo'))
})

test('PDF de amostra: sai com o texto do modelo, marcado como amostra; leitor também baixa', async () => {
  const r = await A.api('/v1/modelos/termo_confidencialidade_colaborador/amostra.pdf')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'application/pdf')
  assert.match(r.headers.get('content-disposition'), /amostra-termo_confidencialidade_colaborador\.pdf/)
  const buf = Buffer.from(await r.arrayBuffer())
  assert.ok(buf.length > 20_000)
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-')

  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Leo Leitor', email: 'leitor@org1.exemplo', papel: 'leitor', senha: SENHA })
  const leitor = await A.entrar('leitor@org1.exemplo')
  assert.equal((await A.api('/painel/api/org/modelos/prestacao_servicos/amostra.pdf', { chave: null, cookie: leitor })).status, 200)
  assert.equal((await A.api('/painel/api/org/modelos/prestacao_servicos', { chave: null, cookie: leitor })).status, 200)
})
