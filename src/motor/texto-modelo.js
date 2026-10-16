// O modelo "em branco", legível por gente: variáveis viram «rótulo» e cada
// regra vira uma frase ("quando o tipo do contratado é pessoa jurídica").
//
// É o que o representante da empresa lê na assinatura em lote: ele não assina
// um texto preenchido, assina N contratos do MESMO modelo com dados
// diferentes. Então ele vê o modelo uma vez e os dados de cada pessoa numa
// tabela.

import { paragrafosDe } from './montar.js'

const PLACEHOLDER = /\{\{\s*([\w.:]+)(?:\s*\|\s*(\w+))?\s*\}\}/g
const EMBUTIDAS = { 'sistema.data_geracao': 'data da assinatura' }

export function textoDoModelo(modelo, indice, { chaves = null, contagem = null } = {}) {
  const defs = Object.fromEntries(modelo.variaveis.map(v => [v.chave, v]))
  const titulos = {}
  for (const b of modelo.blocos) {
    const c = indice.get(`${b.clausula}@${b.versao}`)
    if (c) titulos[c.chave] = c.titulo
  }
  const rotular = (texto) => String(texto || '').replace(PLACEHOLDER, (_, chave) => {
    if (chave.startsWith('ref:')) return `cláusula "${titulos[chave.slice(4)] || chave.slice(4)}"`
    return `«${defs[chave]?.rotulo || EMBUTIDAS[chave] || chave}»`
  })
  const frase = (regra) => (regra ? humanizar(regra, defs) : null)

  const clausulas = []
  for (const b of modelo.blocos) {
    const c = indice.get(`${b.clausula}@${b.versao}`)
    if (!c || (chaves && !chaves.has(c.chave))) continue
    clausulas.push({
      chave: c.chave,
      titulo: c.titulo,
      critica: !!c.critica,
      condicao: frase(b.quando),
      contratos: contagem?.get(c.chave) ?? null,
      paragrafos: paragrafosDe(c).map(p => ({ texto: rotular(p.texto), condicao: frase(p.quando) })),
      resumo: c.resumo_simples ? rotular(c.resumo_simples) : null,
    })
  }
  return {
    titulo: rotular(modelo.titulo),
    preambulo: modelo.preambulo ? rotular(modelo.preambulo) : null,
    fecho: modelo.fecho ? rotular(modelo.fecho) : null,
    clausulas,
  }
}

export function humanizar(regra, defs) {
  if (regra.e) return regra.e.map(r => humanizar(r, defs)).join(' e ')
  if (regra.ou) return regra.ou.map(r => humanizar(r, defs)).join(' ou ')
  if (regra.nao) return `não (${humanizar(regra.nao, defs)})`
  const def = defs[regra.campo]
  const rot = def?.rotulo || regra.campo
  const val = (v) => def?.opcoes?.find(o => o.valor === v)?.texto ?? String(v)
  switch (regra.op) {
    case 'eq': return `${rot} é ${val(regra.valor)}`
    case 'neq': return `${rot} não é ${val(regra.valor)}`
    case 'in': return `${rot} é ${regra.valor.map(val).join(' ou ')}`
    case 'nin': return `${rot} não é ${regra.valor.map(val).join(' nem ')}`
    case 'gt': return `${rot} maior que ${regra.valor}`
    case 'gte': return `${rot} a partir de ${regra.valor}`
    case 'lt': return `${rot} menor que ${regra.valor}`
    case 'lte': return `${rot} até ${regra.valor}`
    case 'existe': return `houver ${rot}`
    case 'vazio': return `não houver ${rot}`
    case 'verdadeiro': return rot
    default: return `${rot} ${regra.op} ${regra.valor}`
  }
}
