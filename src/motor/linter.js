// Linter jurídico: o `conferirTexto` do ExameQR, generalizado para modelos com
// regras. Roda antes de PUBLICAR uma versão do modelo. Graves bloqueiam a
// publicação; avisos aparecem para o redator decidir.
//
// O que ele prova e uma revisão a olho não pega: enumera todas as combinações
// das variáveis que decidem cláusulas (tipo da parte × prazo × …) e confere, em
// CADA uma, que as cláusulas obrigatórias entram e que as exclusivas não
// entram em dobro. "Funciona para PF" não garante "funciona para MEI".

import { TIPOS } from './tipos.js'
import { avaliar, camposDaRegra, validarRegra } from './regras.js'
import { indexarBiblioteca, paragrafosDe, placeholdersDe } from './montar.js'
import { legislacaoPadrao } from '../legislacao/legislacao.js'

export const CATEGORIAS_OBRIGATORIAS = ['partes', 'objeto', 'preco', 'prazo', 'foro', 'assinatura_eletronica', 'protecao_dados']
export const CATEGORIAS_UNICAS = ['prazo', 'foro', 'assinatura_eletronica']
const LIMITE_COMBINACOES = 512
const EMBUTIDAS = new Set(['sistema.data_geracao'])

export function lintModelo(modelo, biblioteca, { legislacao } = {}) {
  const idx = biblioteca instanceof Map ? biblioteca : indexarBiblioteca(biblioteca)
  // `legislacao: null` desliga a conferência (testes do motor puro).
  const leg = legislacao === undefined ? legislacaoPadrao() : legislacao
  const graves = [], avisos = []
  const grave = (msg, onde) => graves.push({ msg, onde })
  const aviso = (msg, onde) => avisos.push({ msg, onde })

  const defs = new Map(modelo.variaveis.map(v => [v.chave, v]))
  const usadas = new Set()
  let regrasQuebradas = false

  // ── Variáveis ─────────────────────────────────────────────────────────────
  for (const v of modelo.variaveis) {
    if (!TIPOS[v.tipo]) grave(`tipo desconhecido "${v.tipo}"`, `variável ${v.chave}`)
    if (v.tipo === 'enum' && !v.opcoes?.length) grave('enum sem opções', `variável ${v.chave}`)
  }

  // ── Blocos e cláusulas ────────────────────────────────────────────────────
  const blocos = []
  const chavesNoModelo = new Set(modelo.blocos.map(b => b.clausula))
  modelo.blocos.forEach((b, i) => {
    const onde = `bloco ${i + 1} (${b.clausula}@${b.versao})`
    const errosRegra = validarRegra(b.quando, 'quando')
    errosRegra.forEach(e => grave(e, onde))
    if (errosRegra.length) regrasQuebradas = true
    camposDaRegra(b.quando).forEach(c => usadas.add(c))
    const c = idx.get(`${b.clausula}@${b.versao}`)
    if (!c) { grave('cláusula não existe na biblioteca', onde); return }
    blocos.push({ b, c })

    // Base legal: a bula mostra "o que diz a lei" a partir dela. Artigo que não
    // existe ou norma revogada é grave; norma que não está baixada é aviso.
    if (!c.base_legal) aviso('sem base legal — a bula não terá "o que diz a lei" nesta cláusula', onde)
    else if (leg) {
      for (const item of leg.resolver(c.base_legal)) {
        for (const p of item.problemas) (/não está na legislação local|não foi baixado/.test(p) ? aviso : grave)(`base legal: ${p}`, onde)
      }
    }

    const textos = [c.titulo, c.resumo_simples || '']
    paragrafosDe(c).forEach((p, j) => {
      textos.push(p.texto)
      const errosP = validarRegra(p.quando, `parágrafo ${j + 1}`)
      errosP.forEach(e => grave(e, onde))
      if (errosP.length) regrasQuebradas = true
      camposDaRegra(p.quando).forEach(k => usadas.add(k))
    })

    for (const t of textos) {
      for (const { chave } of placeholdersDe(t)) {
        if (chave.startsWith('ref:')) {
          if (!chavesNoModelo.has(chave.slice(4))) grave(`referência a cláusula fora do modelo: {{${chave}}}`, onde)
          continue
        }
        usadas.add(chave)
        if (!defs.has(chave) && !EMBUTIDAS.has(chave)) grave(`placeholder sem variável declarada: {{${chave}}} — nada preenche isso na geração`, onde)
      }
      const colchetes = t.match(/\[[^\]\n]{1,120}\]/g)
      if (colchetes) grave(`campo entre colchetes ${colchetes.slice(0, 3).join(' ')} — vira lacuna no contrato assinado; use {{variável}}`, onde)
    }

    if (c.critica && !c.resumo_simples) grave('cláusula crítica sem resumo em linguagem simples — a "bula" exige', onde)
    // A bula é lida por TODOS os signatários: "você" fala com um lado só e
    // diz a coisa errada para o outro.
    if (/\bvoc[eê]s?\b/i.test(c.resumo_simples || '')) aviso('resumo fala com "você" — todos os signatários leem a mesma bula; nomeie a parte ("quem presta o serviço")', onde)
    if (c.resumo_simples) {
      const tamTexto = paragrafosDe(c).reduce((s, p) => s + p.texto.length, 0)
      if (c.resumo_simples.length > tamTexto) aviso('resumo mais longo que o texto da cláusula — resumo deve simplificar', onde)
    }
  })

  for (const t of [modelo.titulo, modelo.preambulo, modelo.fecho].filter(Boolean)) {
    for (const { chave } of placeholdersDe(t)) {
      if (chave.startsWith('ref:')) {
        if (!chavesNoModelo.has(chave.slice(4))) grave(`referência a cláusula fora do modelo: {{${chave}}}`, 'título/preâmbulo/fecho')
        continue
      }
      usadas.add(chave)
      if (!defs.has(chave) && !EMBUTIDAS.has(chave)) grave(`placeholder sem variável declarada: {{${chave}}}`, 'título/preâmbulo/fecho')
    }
  }

  for (const v of modelo.variaveis) {
    if (!usadas.has(v.chave)) aviso('variável declarada e nunca usada', `variável ${v.chave}`)
  }

  // ── Base legal mínima ─────────────────────────────────────────────────────
  const todoTexto = blocos.flatMap(({ c }) => paragrafosDe(c).map(p => p.texto)).join('\n')
  // `titulo_executivo: false` = documento que não é para cobrar (um termo de
  // conduta, por exemplo): a referência ao CPC 784 não se aplica.
  if (modelo.titulo_executivo !== false && !/784/.test(todoTexto)) aviso('sem referência ao art. 784 do CPC — o contrato não afirma valer como título executivo extrajudicial')

  // ── Quem assina pela parte (usado no lote) ────────────────────────────────
  for (const [i, sp] of (modelo.signatarios_da_parte || []).entries()) {
    const onde = `signatarios_da_parte[${i}]`
    for (const campo of ['nome', 'email', 'cpf']) {
      if (sp[campo] && !defs.has(sp[campo])) grave(`aponta para variável inexistente: ${sp[campo]}`, onde)
    }
    if (!sp.nome || !sp.email) grave('precisa de "nome" e "email"', onde)
    const erros = validarRegra(sp.quando, 'quando')
    erros.forEach(e => grave(e, onde))
    if (erros.length) regrasQuebradas = true
  }

  // ── Combinações ───────────────────────────────────────────────────────────
  // Com regra quebrada não dá para simular: reporta o que já tem e para aqui.
  if (regrasQuebradas) return { ok: false, graves, avisos, combinacoes: 0 }
  const obrigatorias = modelo.categorias_obrigatorias || CATEGORIAS_OBRIGATORIAS
  const unicas = modelo.categorias_unicas || CATEGORIAS_UNICAS
  const { combinacoes, truncado } = enumerarCombinacoes(modelo, blocos, defs)
  if (truncado) aviso(`mais de ${LIMITE_COMBINACOES} combinações de regras — só as primeiras foram conferidas`)

  const faltas = new Map(), dobras = new Map(), semSignatario = []
  for (const combo of combinacoes) {
    if (modelo.signatarios_da_parte && !modelo.signatarios_da_parte.some(sp => avaliar(sp.quando, combo.dados))) semSignatario.push(combo.rotulo)
    const cats = []
    for (const { b, c } of blocos) {
      if (!avaliar(b.quando, combo.dados)) continue
      if (!paragrafosDe(c).some(p => avaliar(p.quando, combo.dados))) continue
      cats.push(c.categoria)
    }
    for (const cat of obrigatorias) {
      if (!cats.includes(cat)) acumular(faltas, cat, combo.rotulo)
    }
    for (const cat of unicas) {
      if (cats.filter(x => x === cat).length > 1) acumular(dobras, cat, combo.rotulo)
    }
  }
  const msgCat = {
    assinatura_eletronica: ' — é dela que depende a validade fora da ICP-Brasil (MP 2.200-2/2001, art. 10 §2º)',
  }
  for (const [cat, combos] of faltas) grave(`sem cláusula de "${cat}" quando ${combos.slice(0, 3).join(' | ')}${combos.length > 3 ? ` (+${combos.length - 3})` : ''}${msgCat[cat] || ''}`)
  if (semSignatario.length) grave(`ninguém assina pela parte quando ${semSignatario.slice(0, 3).join(' | ')} — confira signatarios_da_parte`)
  for (const [cat, combos] of dobras) grave(`duas cláusulas de "${cat}" ao mesmo tempo quando ${combos.slice(0, 3).join(' | ')}`)

  return { ok: graves.length === 0, graves, avisos, combinacoes: combinacoes.length }
}

function acumular(mapa, k, v) {
  if (!mapa.has(k)) mapa.set(k, [])
  mapa.get(k).push(v)
}

// Cada campo de regra ganha um domínio finito: as opções do enum, verdadeiro/
// falso, e — para números — valores dos dois lados de cada limiar usado nas
// regras. Campos de regra sem domínio (texto livre) entram como vazio/preenchido.
function enumerarCombinacoes(modelo, blocos, defs) {
  const campos = new Set()
  const limiares = new Map()
  const coletar = (r) => {
    if (!r) return
    if (r.e || r.ou) return (r.e || r.ou).forEach(coletar)
    if (r.nao) return coletar(r.nao)
    campos.add(r.campo)
    if (['gt', 'gte', 'lt', 'lte'].includes(r.op)) acumular(limiares, r.campo, r.valor)
  }
  modelo.blocos.forEach(b => coletar(b.quando))
  ;(modelo.signatarios_da_parte || []).forEach(sp => coletar(sp.quando))
  blocos.forEach(({ c }) => paragrafosDe(c).forEach(p => coletar(p.quando)))

  const dominios = [...campos].map(campo => {
    const def = defs.get(campo)
    let valores
    if (def?.tipo === 'enum') valores = def.opcoes.map(o => o.valor)
    else if (limiares.has(campo)) valores = [...new Set(limiares.get(campo).flatMap(l => [l - 1, l, l + 1]))].sort((a, b) => a - b)
    else if (def?.tipo === 'booleano') valores = [true, false]
    else valores = [undefined, 'preenchido']
    return { campo, valores }
  })

  const combinacoes = []
  let truncado = false
  const rec = (i, atual) => {
    if (combinacoes.length >= LIMITE_COMBINACOES) { truncado = true; return }
    if (i === dominios.length) {
      const dados = {}
      const rot = []
      for (const [campo, v] of Object.entries(atual)) {
        definir(dados, campo, v)
        rot.push(`${campo}=${v === undefined ? '∅' : v}`)
      }
      combinacoes.push({ dados, rotulo: rot.join(', ') || '(sem regras)' })
      return
    }
    for (const v of dominios[i].valores) rec(i + 1, { ...atual, [dominios[i].campo]: v })
  }
  rec(0, {})
  return { combinacoes, truncado }
}

function definir(o, caminho, v) {
  const partes = caminho.split('.')
  for (const k of partes.slice(0, -1)) o = o[k] ??= {}
  o[partes.at(-1)] = v
}
