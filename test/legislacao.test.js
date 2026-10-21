// Legislação local: leitura das citações ("CC arts. 593 a 609"), índice do
// markdown por artigo, resolução contra os arquivos de verdade, o linter
// reprovando artigo que não existe, e "o que diz a lei" chegando às telas.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analisarCitacao, carregarLegislacao, indexarNorma } from '../src/legislacao/legislacao.js'
import { acharModelo, carregarBiblioteca } from '../src/biblioteca.js'
import { lintModelo } from '../src/motor/linter.js'
import { indexarBiblioteca } from '../src/motor/montar.js'
import { ORG, SENHA, subirServidor } from './apoio-http.js'

const leg = carregarLegislacao()
const bib = carregarBiblioteca()
const clone = (x) => structuredClone(x)

test('lê a citação do jeito que o redator escreve', () => {
  assert.deepEqual(analisarCitacao('CC arts. 593 a 609')[0].artigos, [{ de: '593', ate: '609', dispositivos: [], observacao: null }])
  const cpc = analisarCitacao('CPC art. 784, III e §4º')[0]
  assert.equal(cpc.norma, 'CPC')
  assert.deepEqual(cpc.artigos[0].dispositivos, ['III', '§ 4º'])
  const lgpd = analisarCitacao('Lei 13.709/2018, arts. 7º, V, 39 e 46')[0]
  assert.equal(lgpd.norma, 'Lei 13.709/2018')
  assert.deepEqual(lgpd.artigos.map(a => a.de), ['7', '39', '46'])
  assert.deepEqual(lgpd.artigos[0].dispositivos, ['V'])
  const dois = analisarCitacao('CLT art. 482, g; Lei 9.279/1996 art. 195, XI')
  assert.equal(dois.length, 2)
  assert.deepEqual(dois[0].artigos[0].dispositivos, ['g'])
  assert.deepEqual(dois[1].artigos[0].dispositivos, ['XI'])
  const obs = analisarCitacao('MP 2.200-2/2001 art. 10 §2º. Sem cláusula de foro: a competência é fixada pela CLT (art. 651)')[0]
  assert.deepEqual(obs.artigos[0].dispositivos, ['§ 2º'])
  assert.match(obs.observacao, /^Sem cláusula de foro/)
  assert.equal(analisarCitacao('CLT art. 2º (poder diretivo)')[0].artigos[0].observacao, 'poder diretivo')
  const so = analisarCitacao('Lei 14.063/2020')[0]
  assert.equal(so.norma, 'Lei 14.063/2020'); assert.equal(so.artigos.length, 0)
  assert.deepEqual(analisarCitacao('CC arts. 1.022 e 1.023')[0].artigos.map(a => a.de), ['1022', '1023'])
})

test('indexa o markdown: caput, parágrafos, incisos, alíneas, notas, revogados e número com ponto', () => {
  const md = `---
titulo: "Lei de Exemplo"
revogada: false
baixado_em: 2026-10-13
---
# Lei de Exemplo

**Art. 1º** Primeiro artigo.

**Art. 2º** Segundo artigo:

I - um;

II - dois:

a) dois a;

**§ 1º** Parágrafo um. *(Redação dada pela Lei nº 1, de 1/1/2001)*

**Art. 3º** *(Revogado pela Lei nº 9, de 1/1/2000)*

Art. 4*. (Revogado pela Lei nº 9)*

#### CAPÍTULO II — DO RESTO

**Art. 1.001.** Mil e um, com **caput** em negrito.
`
  const idx = indexarNorma(md)
  assert.equal(idx.meta.titulo, 'Lei de Exemplo')
  assert.equal(idx.meta.revogada, false)
  assert.deepEqual(idx.ordem, ['1', '2', '3', '4', '1001'])
  const a2 = idx.artigos.get('2')
  assert.deepEqual(a2.linhas.map(l => [l.tipo, l.rotulo]), [['caput', 'caput'], ['inciso', 'I'], ['inciso', 'II'], ['alinea', 'a'], ['paragrafo', '§ 1º']])
  assert.equal(a2.linhas[4].texto, 'Parágrafo um.')
  assert.match(a2.linhas[4].nota, /Redação dada/)
  assert.equal(idx.artigos.get('3').revogado, true)
  assert.equal(idx.artigos.get('4').revogado, true)
  assert.equal(idx.artigos.get('1001').linhas[0].texto, 'Mil e um, com caput em negrito.')
})

test('acha a norma por sigla, nome ou número e devolve o artigo de verdade', () => {
  assert.equal(leg.acharNorma('Lei 13.709/2018').sigla, 'LGPD')
  assert.equal(leg.acharNorma('Lei nº 10.406/2002').sigla, 'CC')
  assert.equal(leg.acharNorma('Código de Processo Civil').sigla, 'CPC')
  assert.equal(leg.acharNorma('MP 2.200-2/2001').sigla, 'MP 2.200-2')
  assert.equal(leg.acharNorma('Decreto-Lei 5.452/1943').sigla, 'CLT')
  assert.equal(leg.acharNorma('Lei 99.999/2000'), null)

  assert.match(leg.artigo('CC', '598').linhas[0].texto, /quatro anos/)
  assert.match(leg.artigo('CLT', '442-B').linhas[0].texto, /autônomo/)
  assert.match(leg.artigo('CC', '2046').linhas[0].texto, /remissões/i)

  // Dispositivos pedidos: caput + eles (e o que está abaixo deles), não o artigo inteiro.
  const f784 = leg.fundamentos('CPC art. 784, III e §4º')[0]
  assert.equal(f784.rotulo, 'Código de Processo Civil, art. 784, III, § 4º')
  assert.deepEqual(f784.artigos[0].linhas.map(l => l.rotulo), ['caput', 'III', '§ 4º'])
  assert.match(f784.artigos[0].linhas[2].texto, /provedor de assinatura/)
  // Faixa: todos os artigos.
  const faixa = leg.fundamentos('CC arts. 408 a 413')[0]
  assert.equal(faixa.artigos.length, 6)
  assert.equal(faixa.rotulo, 'Código Civil, arts. 408 a 413')
  assert.equal(leg.fundamentos('CC arts. 422 e 597')[0].rotulo, 'Código Civil, arts. 422 e 597')
  // Norma inteira, sem artigo: só a identificação.
  const so = leg.fundamentos('Lei 14.063/2020')[0]
  assert.equal(so.norma.sigla, 'Lei 14.063'); assert.equal(so.artigos.length, 0); assert.equal(so.encontrado, true)
  assert.equal(so.norma.vigente, true)
  assert.match(so.norma.fonte, /^https:\/\//)
})

test('diz o que não resolve: artigo inexistente, revogado, norma que não está aqui', () => {
  assert.match(leg.resolver('CC art. 99999')[0].problemas[0], /art\. 99999 não existe/)
  assert.match(leg.resolver('CC art. 374')[0].problemas[0], /revogado/)
  assert.match(leg.resolver('Lei 99.999/2000 art. 1º')[0].problemas[0], /não está na legislação local/)
  assert.match(leg.resolver('CPC art. 784, § 99º')[0].problemas[0], /§ 99º não encontrado/)
  assert.equal(leg.fundamentos('CC art. 99999')[0].encontrado, false)
})

test('toda cláusula da semente tem base legal, e toda base legal resolve', () => {
  for (const c of bib.clausulas) {
    assert.ok(c.base_legal, `${c.chave} sem base legal`)
    const problemas = leg.resolver(c.base_legal).flatMap(i => i.problemas)
    assert.deepEqual(problemas, [], `${c.chave}: ${c.base_legal}`)
  }
})

test('linter: artigo inexistente é grave; norma fora da legislação local e cláusula sem base legal são avisos', () => {
  const modelo = acharModelo(bib, 'prestacao_servicos')
  const com = (base_legal) => {
    const cls = clone(bib.clausulas)
    cls.find(c => c.chave === 'foro').base_legal = base_legal
    return lintModelo(modelo, indexarBiblioteca(cls))
  }
  const ok = lintModelo(modelo, bib.indice)
  assert.ok(ok.ok && !ok.avisos.some(a => /base legal/.test(a.msg)), JSON.stringify(ok.avisos))

  const grave = com('CPC art. 99999')
  assert.ok(!grave.ok)
  assert.match(grave.graves.find(g => /base legal/.test(g.msg)).msg, /CPC art\. 99999 não existe/)
  assert.match(grave.graves.find(g => /base legal/.test(g.msg)).onde, /foro@1/)

  const fora = com('Lei 99.999/2000 art. 1º')
  assert.ok(fora.ok)
  assert.match(fora.avisos.find(a => /base legal/.test(a.msg)).msg, /não está na legislação local/)

  const sem = com(null)
  assert.ok(sem.ok)
  assert.match(sem.avisos.find(a => /sem base legal/.test(a.msg)).onde, /foro@1/)

  // Desligada: o motor puro não reclama de nada disso.
  const desligado = lintModelo(modelo, indexarBiblioteca(clone(bib.clausulas).map(c => ({ ...c, base_legal: 'CPC art. 99999' }))), { legislacao: null })
  assert.ok(desligado.ok)
})

const A = await subirServidor()
after(() => A.fechar())

test('quem assina recebe "o que diz a lei" em cada cláusula, resolvido do snapshot', async () => {
  const { modelo, dados } = JSON.parse(readFileSync('exemplos/pf-determinado.json', 'utf8'))
  const c = await A.servico.gerar({ organizacaoId: 'org1', organizacao: ORG, modelo, dados })
  await A.servico.enviar(c.id, 'org1', { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@prestador-exemplo.com.br', papel: 'parte' }] })
  const token = A.caixa('joao@prestador-exemplo.com.br', 'link').meta.link.split('/assinar/')[1]
  await A.servico.solicitarCodigo(token, {})
  const { sessao } = A.servico.validarCodigo(token, A.caixa('joao@prestador-exemplo.com.br', 'codigo').meta.codigo, {})
  const cont = A.servico.conteudo(token, sessao)
  const foro = cont.clausulas.find(x => x.chave === 'foro')
  assert.equal(foro.fundamentos.length, 1)
  assert.equal(foro.fundamentos[0].rotulo, 'Código de Processo Civil, art. 63')
  assert.match(foro.fundamentos[0].artigos[0].linhas[0].texto, /elegendo foro/)
  assert.ok(cont.clausulas.every(x => Array.isArray(x.fundamentos)))
  const ass = cont.clausulas.find(x => x.chave === 'assinatura_eletronica')
  assert.deepEqual(ass.fundamentos.map(f => f.norma.sigla), ['MP 2.200-2', 'CPC', 'Lei 14.063'])
})

test('a demonstração do site e o editor de cláusula do painel trazem o artigo', async () => {
  const demo = await (await fetch(`${A.base}/api/demo/contrato?exemplo=pf-determinado`)).json()
  const multa = demo.clausulas.find(c => c.chave === 'multa_rescisoria')
  assert.equal(multa.fundamentos[0].rotulo, 'Código Civil, arts. 408 a 413')
  assert.equal(multa.fundamentos[0].artigos.length, 6)

  A.plataforma.criarUsuarioDireto({ nome: 'Dev Legis', email: 'legis@plataforma.exemplo', papel: 'developer', senha: SENHA })
  const cookie = await A.entrar('legis@plataforma.exemplo')
  const r = await fetch(`${A.base}/painel/api/plataforma/biblioteca/legislacao?citacao=${encodeURIComponent('CC art. 598; Lei 99.999/2000 art. 1º')}`, { headers: { cookie } })
  assert.equal(r.status, 200)
  const j = await r.json()
  assert.match(j.itens[0].artigos[0].linhas[0].texto, /quatro anos/)
  assert.deepEqual(j.problemas, ['norma "Lei 99.999/2000" não está na legislação local'])
  assert.equal(j.normas.length, 10)
  assert.ok(j.normas.every(n => n.baixada && n.coletado_em))
  const anonimo = await fetch(`${A.base}/painel/api/plataforma/biblioteca/legislacao?citacao=CC%20art.%201`)
  assert.equal(anonimo.status, 401)
})
