// Diretório de partes: preenchido a cada contrato gerado, buscável por nome,
// documento e e-mail, e isolado por organização.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { gruposDeParte } from '../src/partes.js'
import { SENHA, subirServidor } from './apoio-http.js'

let A
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

before(async () => { A = await subirServidor() })
after(() => A.fechar())

test('grupos de parte: prestação e termo têm; aditivo e distrato não', () => {
  const bib = carregarBiblioteca()
  assert.deepEqual(gruposDeParte(acharModelo(bib, 'prestacao_servicos')), ['contratado'])
  assert.deepEqual(gruposDeParte(acharModelo(bib, 'termo_confidencialidade_colaborador')), ['colaborador'])
  assert.deepEqual(gruposDeParte(acharModelo(bib, 'termo_aditivo')), [])
  assert.deepEqual(gruposDeParte(acharModelo(bib, 'distrato')), [])
})

test('gerar um contrato cadastra a parte; o segundo da mesma pessoa atualiza em vez de duplicar', async () => {
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c1 } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  let { corpo: lista } = await A.json(await A.api('/v1/partes'))
  assert.equal(lista.total, 1)
  const p = lista.itens[0]
  assert.equal(p.nome, 'João da Silva Exemplo')
  assert.equal(p.cpf, '529.982.247-25')
  assert.equal(p.tipo, 'pf')
  assert.equal(p.grupo, 'contratado')
  assert.equal(p.contratos, 1)
  assert.equal(p.ultimo_contrato_id, c1.id)
  assert.equal(p.ultimo_modelo, 'prestacao_servicos')
  assert.equal(p.dados.profissao, 'técnico em informática')

  const d2 = structuredClone(dados)
  d2.contratado.profissao = 'analista de suporte'
  const { corpo: c2 } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados: d2 } }))
  ;({ corpo: lista } = await A.json(await A.api('/v1/partes')))
  assert.equal(lista.total, 1, 'mesmo CPF = mesma pessoa')
  assert.equal(lista.itens[0].contratos, 2)
  assert.equal(lista.itens[0].ultimo_contrato_id, c2.id)
  assert.equal(lista.itens[0].dados.profissao, 'analista de suporte', 'o dado mais novo vale')
  assert.equal(lista.itens[0].dados.estado_civil, 'solteiro', 'o que não mudou continua')
})

test('pessoa jurídica entra pelo CNPJ; a busca acha por nome sem acento, por dígitos do documento e por e-mail', async () => {
  const { modelo, dados } = exemplo('pj-indeterminado')
  await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados } }))
  const busca = async (q) => (await A.json(await A.api(`/v1/partes?busca=${encodeURIComponent(q)}`))).corpo.itens.map(p => p.nome)
  assert.deepEqual(await busca(''), ['Limpeza Exemplo Ltda.', 'João da Silva Exemplo'], 'a mais recente primeiro')
  const pj = (await A.json(await A.api('/v1/partes?busca=limpeza'))).corpo.itens[0]
  assert.equal(pj.tipo, 'pj')
  assert.equal(pj.cnpj, '11.444.777/0001-61')
  assert.equal(pj.cpf, null)
  assert.deepEqual(await busca('joao'), ['João da Silva Exemplo'])
  assert.deepEqual(await busca('529.982'), ['João da Silva Exemplo'])
  assert.deepEqual(await busca('11444777'), ['Limpeza Exemplo Ltda.'])
  assert.deepEqual(await busca('contato@limpeza'), ['Limpeza Exemplo Ltda.'])
  assert.deepEqual(await busca('ninguém'), [])
})

test('obter uma parte; id inexistente dá 404; o painel lê pela sessão', async () => {
  const { corpo: lista } = await A.json(await A.api('/v1/partes?busca=joao'))
  const { status, corpo } = await A.json(await A.api(`/v1/partes/${lista.itens[0].id}`))
  assert.equal(status, 200)
  assert.equal(corpo.nome, 'João da Silva Exemplo')
  assert.equal((await A.api('/v1/partes/nao-existe')).status, 404)

  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Eva Emissora', email: 'eva@org1.exemplo', papel: 'emissor', senha: SENHA })
  const cookie = await A.entrar('eva@org1.exemplo')
  const r = await A.json(await A.api('/painel/api/org/partes', { chave: null, cookie }))
  assert.equal(r.status, 200)
  assert.equal(r.corpo.total, 2)
})
