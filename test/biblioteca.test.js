// Biblioteca viva: semente dos arquivos, cláusula sempre em versão nova,
// modelo salvo vira rascunho, publicar exige linter, organização só vê o
// publicado, e contrato gerado não muda quando a biblioteca muda.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarBibliotecaViva, ErroBiblioteca } from '../src/biblioteca.js'
import { subirServidor } from './apoio-http.js'

test('semeia dos arquivos uma vez só e expõe a mesma interface do motor', () => {
  const repo = criarRepo()
  const bib = criarBibliotecaViva({ repo })
  assert.ok(bib.modelos.length >= 4)
  assert.ok(bib.indice.has('autonomia@1'))
  assert.equal(bib.publicados.length, bib.modelos.length, 'a semente nasce publicada')
  const antes = repo.listar('clausulas').length
  criarBibliotecaViva({ repo }) // segunda instância sobre o mesmo repo
  assert.equal(repo.listar('clausulas').length, antes, 'não semeia de novo')
})

test('cláusula: editar cria versão nova; a antiga continua nos modelos até alguém aplicar', () => {
  const bib = criarBibliotecaViva({ repo: criarRepo() })
  const v1 = bib.obterClausula('foro')
  const v2 = bib.salvarClausula({ ...v1, titulo: 'Do foro', paragrafos: [...v1.paragrafos, 'As partes tentarão a mediação antes de qualquer ação.'] })
  assert.equal(v2.versao, v1.versao + 1)
  assert.ok(bib.indice.has('foro@1') && bib.indice.has('foro@2'))
  const m = bib.obterModelo('prestacao_servicos')
  assert.equal(m.blocos.find(b => b.clausula === 'foro').versao, 1, 'o modelo ainda usa a v1')
  const r = bib.atualizarVersaoNosModelos('foro', 2, ['prestacao_servicos'])
  assert.deepEqual(r.afetados, ['prestacao_servicos'])
  const m2 = bib.obterModelo('prestacao_servicos')
  assert.equal(m2.blocos.find(b => b.clausula === 'foro').versao, 2)
  assert.equal(m2.publicado, false, 'virou rascunho: precisa publicar de novo')
  assert.throws(() => bib.salvarClausula({ chave: 'teste_x', titulo: 'X', paragrafos: [], critica: false }), /pelo menos um parágrafo/)
  assert.throws(() => bib.salvarClausula({ chave: 'teste_x', titulo: 'X', paragrafos: ['a'], critica: true }), /resumo em palavras simples/)
})

test('modelo: salvar vira rascunho, publicar exige linter ok, contrato antigo não muda', async () => {
  const A = await subirServidor()
  after(() => A.fechar())
  const bib = A.servico.biblioteca || criarBibliotecaViva({ repo: A.repo })
  const dev = await A.entrar('dev@plataforma.exemplo').catch(() => null)
  // Um contrato gerado com o modelo publicado.
  const exemplo = JSON.parse(readFileSync('exemplos/pf-determinado.json', 'utf8'))
  const c = (await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: exemplo }))).corpo
  assert.equal(c.status, 'gerado')
  const titulos = (await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo.clausulas.map(x => x.titulo)

  // Salvar o modelo com uma cláusula a menos: vira rascunho e some da lista da organização.
  const m = bib.obterModelo('prestacao_servicos')
  const salvo = bib.salvarModelo({ ...m, blocos: m.blocos.filter(b => b.clausula !== 'comunicacoes') })
  assert.equal(salvo.publicado, false)
  const lista = (await A.json(await A.api('/v1/modelos'))).corpo
  assert.ok(!lista.some(x => x.chave === 'prestacao_servicos'), 'rascunho não aparece para a organização')
  const recusado = await A.api('/v1/contratos', { metodo: 'POST', corpo: exemplo })
  assert.equal(recusado.status, 404, 'não gera com modelo em rascunho')

  // O contrato já gerado continua igual.
  const depois = (await A.json(await A.api(`/v1/contratos/${c.id}`))).corpo.clausulas.map(x => x.titulo)
  assert.deepEqual(depois, titulos)

  // Publicar de novo: versão sobe, volta para a organização.
  const pub = bib.publicarModelo('prestacao_servicos')
  assert.equal(pub.publicado, true)
  assert.equal(pub.versao, m.versao + 1)
  assert.ok((await A.json(await A.api('/v1/modelos'))).corpo.some(x => x.chave === 'prestacao_servicos'))

  // Modelo quebrado não publica.
  bib.salvarModelo({ ...m, blocos: [{ clausula: 'multa_rescisoria', versao: 1 }] })
  assert.throws(() => bib.publicarModelo('prestacao_servicos'), ErroBiblioteca)
  bib.salvarModelo(m); bib.publicarModelo('prestacao_servicos')

  // Duplicar e validar forma.
  const copia = bib.duplicarModelo('prestacao_servicos', 'servicos_medicos', 'Contrato de serviços médicos')
  assert.equal(copia.publicado, false)
  assert.throws(() => bib.salvarModelo({ chave: 'Ruim Chave', titulo: 'x', variaveis: [], blocos: [{ clausula: 'partes', versao: 1 }] }), /Chave do modelo/)
  assert.throws(() => bib.salvarModelo({ chave: 'ok', titulo: 'x', variaveis: [{ chave: 'a.b', rotulo: 'b', tipo: 'inexistente' }], blocos: [{ clausula: 'partes', versao: 1 }] }), /tipo "inexistente"/)
})
