// Montagem: modelo + dados → contrato (snapshot pronto para virar PDF).
//
// Ordem, e por que é essa:
//   1. regras decidem QUAIS cláusulas e parágrafos entram — antes de validar,
//      porque o CPF só é obrigatório se a parte for PF;
//   2. numeração é calculada DEPOIS das regras: tirar a cláusula 4 não deixa um
//      buraco, e referências cruzadas ({{ref:chave}}) apontam para o número final;
//   3. só as variáveis efetivamente usadas são validadas e formatadas.
//
// Nunca lança por dado ruim: devolve `faltando` e `invalidos` e deixa `ok`
// falso. Quem chama decide — a prévia mostra com as lacunas marcadas, o envio
// para assinatura recusa (herdado de `montarConteudo` do ExameQR).

import { createHash } from 'node:crypto'
import { TIPOS, vazio } from './tipos.js'
import { avaliar, camposConsultados, camposDaRegra, ler } from './regras.js'

const PLACEHOLDER = /\{\{\s*([\w.:]+)(?:\s*\|\s*(\w+))?\s*\}\}/g

// Variáveis que o sistema sempre fornece, sem o modelo declarar.
const EMBUTIDAS = {
  'sistema.data_geracao': { chave: 'sistema.data_geracao', rotulo: 'data de geração', tipo: 'data', origem: 'calculada' },
}

export function indexarBiblioteca(clausulas) {
  const idx = new Map()
  for (const c of clausulas) idx.set(`${c.chave}@${c.versao}`, c)
  return idx
}

export function paragrafosDe(clausula) {
  return (clausula.paragrafos || []).map(p => (typeof p === 'string' ? { texto: p } : p))
}

export function placeholdersDe(texto) {
  return [...String(texto || '').matchAll(PLACEHOLDER)].map(m => ({ chave: m[1], filtro: m[2] || null }))
}

export function montarContrato({ modelo, biblioteca, dados, agora = new Date() }) {
  const idx = biblioteca instanceof Map ? biblioteca : indexarBiblioteca(biblioteca)
  const defs = Object.fromEntries([...Object.entries(EMBUTIDAS), ...modelo.variaveis.map(v => [v.chave, v])])
  const ctx = aplicarPadroes(modelo, dados, agora)

  const faltando = new Map()   // chave → { variavel, rotulo, motivo }
  const invalidos = new Map()
  const anotarFalta = (chave, motivo) => {
    if (!faltando.has(chave)) faltando.set(chave, { variavel: chave, rotulo: defs[chave]?.rotulo || chave, motivo })
  }

  // ── 1. Regras ─────────────────────────────────────────────────────────────
  // Campo de regra sem valor é falta (a regra decidiria às cegas).
  const regrasCampos = new Set()
  for (const b of modelo.blocos) {
    camposDaRegra(b.quando, regrasCampos)
    const c = idx.get(`${b.clausula}@${b.versao}`)
    if (c) paragrafosDe(c).forEach(p => camposDaRegra(p.quando, regrasCampos))
  }
  for (const campo of regrasCampos) {
    const v = ler(ctx, campo)
    if (vazio(v) && defs[campo]?.obrigatoria !== false) anotarFalta(campo, 'decide quais cláusulas entram')
    else if (!vazio(v)) checarTipo(campo, v)
  }

  const incluidas = []
  for (const b of modelo.blocos) {
    const c = idx.get(`${b.clausula}@${b.versao}`)
    if (!c) throw new Error(`modelo ${modelo.chave}: cláusula ${b.clausula}@${b.versao} não existe na biblioteca`)
    if (!avaliar(b.quando, ctx)) continue
    const paragrafos = paragrafosDe(c).filter(p => avaliar(p.quando, ctx))
    if (paragrafos.length) incluidas.push({ c, paragrafos })
  }

  // ── 2. Numeração ──────────────────────────────────────────────────────────
  const numeroDe = new Map(incluidas.map((x, i) => [x.c.chave, i + 1]))

  // ── 3. Substituição ───────────────────────────────────────────────────────
  const preencher = (texto) => String(texto).replace(PLACEHOLDER, (bruto, chave, filtro) => {
    if (chave.startsWith('ref:')) {
      const alvo = chave.slice(4)
      if (numeroDe.has(alvo)) return `cláusula ${numeroDe.get(alvo)}`
      anotarFalta(chave, `referência à cláusula "${alvo}", que não entrou neste contrato`)
      return bruto
    }
    const def = defs[chave]
    if (!def) { anotarFalta(chave, 'placeholder sem variável declarada no modelo'); return bruto }
    const v = ler(ctx, chave)
    if (vazio(v)) { anotarFalta(chave, motivoFalta(def)); return bruto }
    if (!checarTipo(chave, v)) return bruto
    return TIPOS[def.tipo].formatar(v, def, filtro)
  })

  function checarTipo(chave, v) {
    const def = defs[chave]
    const tipo = TIPOS[def?.tipo]
    if (!tipo) return true
    const erro = tipo.validar(v, def)
    if (erro && !invalidos.has(chave)) invalidos.set(chave, { variavel: chave, rotulo: def.rotulo, motivo: erro })
    return !erro
  }

  const clausulas = incluidas.map(({ c, paragrafos }, i) => {
    const n = i + 1
    return {
      numero: n,
      chave: c.chave,
      versao: c.versao,
      categoria: c.categoria,
      titulo: c.titulo,
      paragrafos: paragrafos.map((p, j) => ({ numero: `${n}.${j + 1}`, texto: preencher(p.texto) })),
      resumo: c.resumo_simples ? preencher(c.resumo_simples) : null,
      critica: !!c.critica,
      base_legal: c.base_legal || null,
    }
  })

  const contrato = {
    modelo: { chave: modelo.chave, versao: modelo.versao },
    titulo: preencher(modelo.titulo),
    preambulo: modelo.preambulo ? preencher(modelo.preambulo) : null,
    fecho: modelo.fecho ? preencher(modelo.fecho) : null,
    clausulas,
    gerado_em: agora.toISOString(),
  }
  contrato.conteudo_sha256 = hashConteudo(contrato)

  return {
    ok: faltando.size === 0 && invalidos.size === 0,
    contrato,
    faltando: [...faltando.values()],
    invalidos: [...invalidos.values()],
  }
}

// Hash do CONTEÚDO (não do PDF): o que foi acordado, independente de layout.
// Exclui gerado_em para que gerar duas vezes o mesmo texto dê o mesmo hash.
// Quais variáveis ESTE contrato precisa, dados os valores atuais: os campos que
// decidem regras, mais os placeholders das cláusulas e parágrafos que entram.
// É o que deixa o formulário mostrar CNPJ só quando a parte é PJ.
export function camposNecessarios({ modelo, biblioteca, dados }) {
  const idx = biblioteca instanceof Map ? biblioteca : indexarBiblioteca(biblioteca)
  const necessarios = new Set()
  const usar = (texto) => placeholdersDe(texto).forEach(p => { if (!p.chave.startsWith('ref:')) necessarios.add(p.chave) })
  for (const b of modelo.blocos) {
    camposConsultados(b.quando, dados, necessarios)
    const c = idx.get(`${b.clausula}@${b.versao}`)
    if (!c || !avaliar(b.quando, dados)) continue
    for (const p of paragrafosDe(c)) {
      camposConsultados(p.quando, dados, necessarios)
      if (avaliar(p.quando, dados)) usar(p.texto)
    }
    if (c.resumo_simples) usar(c.resumo_simples)
  }
  ;[modelo.titulo, modelo.preambulo, modelo.fecho].filter(Boolean).forEach(usar)
  ;(modelo.signatarios_da_parte || []).forEach(sp => camposConsultados(sp.quando, dados, necessarios))
  return necessarios
}

export function hashConteudo(contrato) {
  const { gerado_em, conteudo_sha256, ...resto } = contrato
  return createHash('sha256').update(JSON.stringify(resto)).digest('hex')
}

export function aplicarPadroes(modelo, dados, agora) {
  const ctx = structuredClone(dados || {})
  ctx.sistema = { ...(ctx.sistema || {}), data_geracao: agora.toISOString().slice(0, 10) }
  for (const v of modelo.variaveis) {
    if (v.padrao === undefined || !vazio(ler(ctx, v.chave))) continue
    const partes = v.chave.split('.')
    let o = ctx
    for (const k of partes.slice(0, -1)) o = o[k] ??= {}
    o[partes.at(-1)] = v.padrao
  }
  return ctx
}

// Diz ONDE resolver, não só o que falta.
function motivoFalta(def) {
  const onde = {
    parte: 'preencha no cadastro da parte',
    organizacao: 'preencha no cadastro da organização',
    parametro: 'defina nos parâmetros do modelo',
    fonte: 'não veio da fonte de dados — confira o mapeamento de colunas',
    manual: 'preencha ao gerar o contrato',
  }
  return `${def.rotulo}: ${onde[def.origem] || 'sem valor'}`
}
