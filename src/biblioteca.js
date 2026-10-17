// Biblioteca de cláusulas e modelos.
//
// Duas formas de obter uma:
//   - carregarBiblioteca(dir): lê os arquivos de biblioteca/ (semente; CLI e testes).
//   - criarBibliotecaViva({ repo }): mora no armazenamento (coleções `clausulas`
//     e `modelos`), semeada dos arquivos na primeira vez. É a que o servidor usa:
//     o developer edita e publica pelo painel, e a organização só vê o publicado.
//
// Regras que valem nas duas:
//   - cláusula é imutável por versão: editar cria `chave@versao+1`; modelos que
//     apontam para a versão antiga continuam iguais;
//   - modelo salvo vira rascunho; publicar exige passar no linter;
//   - contrato gerado guarda o snapshot do texto, então mexer na biblioteca nunca
//     altera contrato existente (herdado do ExameQR).

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexarBiblioteca, paragrafosDe, placeholdersDe } from './motor/montar.js'
import { lintModelo } from './motor/linter.js'
import { TIPOS } from './motor/tipos.js'

export const DIR_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..', 'biblioteca')

const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

export function carregarBiblioteca(dir = DIR_PADRAO) {
  const clausulas = lerJson(join(dir, 'clausulas.json'))
  const modelos = readdirSync(join(dir, 'modelos'))
    .filter(f => f.endsWith('.json'))
    .map(f => lerJson(join(dir, 'modelos', f)))
  return { clausulas, indice: indexarBiblioteca(clausulas), modelos, publicados: modelos }
}

export function acharModelo(bib, chave) {
  const m = bib.modelos.find(x => x.chave === chave)
  if (!m) throw new Error(`modelo "${chave}" não existe (há: ${bib.modelos.map(x => x.chave).join(', ')})`)
  return m
}

export class ErroBiblioteca extends Error {
  constructor(status, mensagem, detalhes) { super(mensagem); this.status = status; this.detalhes = detalhes }
}

const CHAVE = /^[a-z][a-z0-9_]{1,60}$/
const ORIGENS = ['manual', 'parte', 'parametro', 'fonte', 'organizacao', 'calculada']
const OPS = ['eq', 'neq', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'existe', 'vazio', 'verdadeiro']

// ── Validações de forma (o linter cuida da lógica) ───────────────────────────

function validarRegra(r, onde) {
  if (r == null) return
  if (typeof r !== 'object') throw new ErroBiblioteca(400, `${onde}: a condição precisa ser um objeto.`)
  if (r.e || r.ou) { (r.e || r.ou).forEach((x, i) => validarRegra(x, `${onde}[${i}]`)); return }
  if (r.nao) { validarRegra(r.nao, `${onde}.nao`); return }
  if (!r.campo || typeof r.campo !== 'string') throw new ErroBiblioteca(400, `${onde}: a condição precisa de "campo".`)
  if (!OPS.includes(r.op)) throw new ErroBiblioteca(400, `${onde}: operador "${r.op}" não existe (use ${OPS.join(', ')}).`)
}

export function validarClausula(c) {
  if (!CHAVE.test(c.chave || '')) throw new ErroBiblioteca(400, 'Chave da cláusula: só letras minúsculas, números e _, começando por letra.')
  if (!String(c.titulo || '').trim()) throw new ErroBiblioteca(400, 'A cláusula precisa de título.')
  const ps = paragrafosDe(c)
  if (!ps.length || ps.some(p => !String(p.texto || '').trim())) throw new ErroBiblioteca(400, 'A cláusula precisa de pelo menos um parágrafo, e nenhum pode ficar vazio.')
  ps.forEach((p, i) => validarRegra(p.quando, `parágrafo ${i + 1}`))
  if (c.critica && !String(c.resumo_simples || '').trim()) throw new ErroBiblioteca(400, 'Cláusula em destaque precisa do resumo em palavras simples: é ele que a pessoa confirma ter entendido.')
}

export function validarModelo(m) {
  if (!CHAVE.test(m.chave || '')) throw new ErroBiblioteca(400, 'Chave do modelo: só letras minúsculas, números e _, começando por letra.')
  if (!String(m.titulo || '').trim()) throw new ErroBiblioteca(400, 'O modelo precisa de título.')
  if (!Array.isArray(m.variaveis)) throw new ErroBiblioteca(400, '"variaveis" precisa ser uma lista.')
  if (!Array.isArray(m.blocos) || !m.blocos.length) throw new ErroBiblioteca(400, 'O modelo precisa de pelo menos uma cláusula.')
  const chaves = new Set()
  for (const v of m.variaveis) {
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(v.chave || '')) throw new ErroBiblioteca(400, `Variável "${v.chave}": use grupo.nome, como contratado.nome.`)
    if (chaves.has(v.chave)) throw new ErroBiblioteca(400, `Variável "${v.chave}" repetida.`)
    chaves.add(v.chave)
    if (!TIPOS[v.tipo]) throw new ErroBiblioteca(400, `Variável "${v.chave}": tipo "${v.tipo}" não existe (use ${Object.keys(TIPOS).join(', ')}).`)
    if (v.origem && !ORIGENS.includes(v.origem)) throw new ErroBiblioteca(400, `Variável "${v.chave}": origem "${v.origem}" não existe (use ${ORIGENS.join(', ')}).`)
    if (v.tipo === 'enum' && !(Array.isArray(v.opcoes) && v.opcoes.length && v.opcoes.every(o => o && o.valor !== undefined && o.texto))) throw new ErroBiblioteca(400, `Variável "${v.chave}": enum precisa de opções com valor e texto.`)
    if (!String(v.rotulo || '').trim()) throw new ErroBiblioteca(400, `Variável "${v.chave}" precisa de rótulo (é o nome do campo no formulário).`)
  }
  m.blocos.forEach((b, i) => {
    if (!b.clausula || !Number.isInteger(b.versao)) throw new ErroBiblioteca(400, `Cláusula ${i + 1} do modelo: precisa de "clausula" e "versao".`)
    validarRegra(b.quando, `cláusula ${i + 1} (${b.clausula})`)
  })
  for (const sp of m.signatarios_da_parte || []) {
    if (!sp.nome || !sp.email) throw new ErroBiblioteca(400, 'Cada signatário da parte precisa dizer de quais variáveis vêm nome e e-mail.')
    validarRegra(sp.quando, `signatário ${sp.papel || ''}`)
  }
}

// ── Biblioteca viva ──────────────────────────────────────────────────────────

export function criarBibliotecaViva({ repo, semente = DIR_PADRAO, agora = () => new Date() } = {}) {
  const agoraIso = () => agora().toISOString()

  // Primeira vez: semeia dos arquivos, tudo publicado.
  if (repo.listar('modelos').length === 0 && repo.listar('clausulas').length === 0) {
    const base = carregarBiblioteca(semente)
    for (const c of base.clausulas) repo.inserir('clausulas', { ...c, id: `${c.chave}@${c.versao}`, criada_em: agoraIso(), origem: 'semente' })
    for (const m of base.modelos) repo.inserir('modelos', { ...m, id: m.chave, publicado: true, publicado_em: agoraIso(), atualizado_em: agoraIso(), origem: 'semente' })
  }

  const semMeta = ({ id, criada_em, atualizado_em, publicado_em, origem, ...resto }) => resto
  const todasClausulas = () => repo.listar('clausulas').sort((a, b) => a.chave.localeCompare(b.chave) || a.versao - b.versao)
  const todosModelos = () => repo.listar('modelos').sort((a, b) => a.titulo.localeCompare(b.titulo))

  const bib = {
    // A interface que o motor, o serviço e o lote já usam.
    get clausulas() { return todasClausulas().map(semMeta) },
    get indice() { return indexarBiblioteca(todasClausulas()) },
    get modelos() { return todosModelos().map(semMeta) },               // todos (um lote em andamento pode apontar para um que virou rascunho)
    get publicados() { return todosModelos().filter(m => m.publicado).map(semMeta) },
    estaPublicado(chave) { return !!repo.obter('modelos', chave)?.publicado },

    // ── Para o painel do developer ──────────────────────────────────────────
    resumo() {
      const modelos = todosModelos()
      const usoClausula = new Map()
      for (const m of modelos) for (const b of m.blocos) { const k = `${b.clausula}@${b.versao}`; usoClausula.set(k, [...(usoClausula.get(k) || []), m.chave]) }
      const contratosPorModelo = repo.listar('contratos').reduce((acc, c) => { const k = c.modelo?.chave; if (k) acc[k] = (acc[k] || 0) + 1; return acc }, {})
      const porChave = new Map()
      for (const c of todasClausulas()) {
        const g = porChave.get(c.chave) || { chave: c.chave, titulo: c.titulo, categoria: c.categoria || null, critica: !!c.critica, versoes: [] }
        g.titulo = c.titulo; g.critica = !!c.critica; g.categoria = c.categoria || null
        g.versoes.push({ versao: c.versao, criada_em: c.criada_em || null, origem: c.origem || null, usada_em: usoClausula.get(`${c.chave}@${c.versao}`) || [] })
        porChave.set(c.chave, g)
      }
      return {
        modelos: modelos.map(m => ({
          chave: m.chave, versao: m.versao, titulo: m.titulo, descricao: m.descricao || '', derivado: !!m.derivado,
          publicado: !!m.publicado, publicado_em: m.publicado_em || null, atualizado_em: m.atualizado_em || null,
          clausulas: m.blocos.length, variaveis: m.variaveis.length, contratos: contratosPorModelo[m.chave] || 0,
          lint: resumoLint(lintModelo(semMeta(m), bib.indice)),
        })),
        clausulas: [...porChave.values()],
        tipos: Object.keys(TIPOS), origens: ORIGENS, operadores: OPS,
      }
    },
    obterModelo(chave) {
      const m = repo.obter('modelos', chave)
      if (!m) throw new ErroBiblioteca(404, 'Modelo não encontrado.')
      return { ...m, lint: lintModelo(semMeta(m), bib.indice) }
    },
    obterClausula(chave, versao) {
      const todas = todasClausulas().filter(c => c.chave === chave)
      if (!todas.length) throw new ErroBiblioteca(404, 'Cláusula não encontrada.')
      const atual = versao ? todas.find(c => c.versao === Number(versao)) : todas.at(-1)
      if (!atual) throw new ErroBiblioteca(404, 'Versão não encontrada.')
      return { ...atual, versoes: todas.map(c => c.versao) }
    },

    // Cláusula: sempre uma versão nova. Quem quiser que um modelo use a nova,
    // atualiza o bloco do modelo (ver atualizarVersaoNosModelos).
    salvarClausula(dados) {
      const c = { chave: dados.chave, categoria: dados.categoria || null, titulo: String(dados.titulo || '').trim(), paragrafos: dados.paragrafos, resumo_simples: dados.resumo_simples || null, critica: !!dados.critica, base_legal: dados.base_legal || null }
      validarClausula(c)
      // Placeholders precisam ter a forma certa; se existem num modelo é o linter que diz.
      for (const p of paragrafosDe(c)) placeholdersDe(p.texto)
      const anteriores = todasClausulas().filter(x => x.chave === c.chave)
      c.versao = anteriores.length ? Math.max(...anteriores.map(x => x.versao)) + 1 : 1
      return semMeta(repo.inserir('clausulas', { ...c, id: `${c.chave}@${c.versao}`, criada_em: agoraIso(), origem: 'painel' }))
    },
    // Troca a versão da cláusula nos modelos indicados; eles viram rascunho.
    atualizarVersaoNosModelos(chave, versao, modelos) {
      if (!bib.indice.has(`${chave}@${versao}`)) throw new ErroBiblioteca(404, 'Versão da cláusula não encontrada.')
      const afetados = []
      for (const mc of modelos) {
        const m = repo.obter('modelos', mc)
        if (!m) continue
        const blocos = m.blocos.map(b => (b.clausula === chave && b.versao !== versao ? { ...b, versao } : b))
        if (JSON.stringify(blocos) !== JSON.stringify(m.blocos)) {
          repo.atualizar('modelos', mc, { blocos, publicado: false, atualizado_em: agoraIso() })
          afetados.push(mc)
        }
      }
      return { afetados }
    },

    // Modelo: salvar vira rascunho (a organização deixa de ver até publicar de novo).
    salvarModelo(dados) {
      const m = {
        chave: dados.chave, titulo: String(dados.titulo || '').trim(), descricao: dados.descricao || '',
        preambulo: dados.preambulo || null, fecho: dados.fecho || null,
        variaveis: dados.variaveis || [], blocos: dados.blocos || [],
        signatarios_da_parte: dados.signatarios_da_parte || [], resumo_lote: dados.resumo_lote || [],
        vida: dados.vida || null, derivado: dados.derivado || null,
      }
      if (!m.vida) delete m.vida
      if (!m.derivado) delete m.derivado
      if (!m.preambulo) delete m.preambulo
      if (!m.fecho) delete m.fecho
      validarModelo(m)
      for (const b of m.blocos) if (!bib.indice.has(`${b.clausula}@${b.versao}`)) throw new ErroBiblioteca(400, `Cláusula ${b.clausula} v${b.versao} não existe na biblioteca.`)
      const atual = repo.obter('modelos', m.chave)
      const lint = lintModelo(m, bib.indice)
      if (atual) {
        const salvo = repo.atualizar('modelos', m.chave, { ...m, versao: atual.versao, publicado: false, atualizado_em: agoraIso() })
        return { ...salvo, lint }
      }
      const salvo = repo.inserir('modelos', { ...m, id: m.chave, versao: 1, publicado: false, atualizado_em: agoraIso(), origem: 'painel' })
      return { ...salvo, lint }
    },
    publicarModelo(chave) {
      const m = repo.obter('modelos', chave)
      if (!m) throw new ErroBiblioteca(404, 'Modelo não encontrado.')
      const lint = lintModelo(semMeta(m), bib.indice)
      if (!lint.ok) throw new ErroBiblioteca(422, `O modelo não passa no linter: ${lint.graves.map(g => g.msg).join('; ')}`, { lint })
      // Publicar uma edição é uma versão nova do modelo: contratos antigos guardam a sua.
      const versao = m.publicado_em ? m.versao + 1 : m.versao
      return { ...repo.atualizar('modelos', chave, { publicado: true, versao, publicado_em: agoraIso() }), lint }
    },
    despublicarModelo(chave) {
      if (!repo.obter('modelos', chave)) throw new ErroBiblioteca(404, 'Modelo não encontrado.')
      return repo.atualizar('modelos', chave, { publicado: false })
    },
    duplicarModelo(chave, novaChave, novoTitulo) {
      const m = repo.obter('modelos', chave)
      if (!m) throw new ErroBiblioteca(404, 'Modelo não encontrado.')
      if (!CHAVE.test(novaChave || '')) throw new ErroBiblioteca(400, 'Chave do novo modelo: só letras minúsculas, números e _.')
      if (repo.obter('modelos', novaChave)) throw new ErroBiblioteca(409, 'Já existe um modelo com essa chave.')
      const { id, publicado, publicado_em, atualizado_em, origem, ...resto } = m
      return repo.inserir('modelos', { ...resto, chave: novaChave, titulo: novoTitulo || `${m.titulo} (cópia)`, id: novaChave, versao: 1, publicado: false, atualizado_em: agoraIso(), origem: 'painel' })
    },
    lintar(modelo) { return lintModelo(modelo, bib.indice) },
  }
  return bib
}

function resumoLint(l) {
  return { ok: l.ok, graves: l.graves.length, avisos: l.avisos.length, combinacoes: l.combinacoes }
}
