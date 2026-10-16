// Regras declarativas: decidem se um bloco de cláusula entra no contrato.
//
// Forma:
//   { campo: 'contratado.tipo', op: 'in', valor: ['pj', 'mei'] }
//   { e:  [regra, regra] }
//   { ou: [regra, regra] }
//   { nao: regra }
//
// Sem código livre de propósito: uma regra declarativa pode ser ANALISADA (o
// linter enumera as combinações e prova que nenhuma fica sem cláusula de
// prazo, por exemplo). Uma função JS, não.

import { lerNumero } from './tipos.js'

export const OPERADORES = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  nin: (a, b) => Array.isArray(b) && !b.includes(a),
  gt: (a, b) => num(a) !== null && num(a) > b,
  gte: (a, b) => num(a) !== null && num(a) >= b,
  lt: (a, b) => num(a) !== null && num(a) < b,
  lte: (a, b) => num(a) !== null && num(a) <= b,
  existe: (a) => a !== undefined && a !== null && String(a).trim() !== '',
  vazio: (a) => a === undefined || a === null || String(a).trim() === '',
  verdadeiro: (a) => a === true,
}

const num = (v) => lerNumero(v)

export function ler(dados, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dados)
}

export function avaliar(regra, dados) {
  if (!regra) return true
  if (regra.e) return regra.e.every(r => avaliar(r, dados))
  if (regra.ou) return regra.ou.some(r => avaliar(r, dados))
  if (regra.nao) return !avaliar(regra.nao, dados)
  const op = OPERADORES[regra.op]
  if (!op) throw new Error(`operador desconhecido: ${regra.op}`)
  return op(ler(dados, regra.campo), regra.valor)
}

// Todos os campos que uma regra consulta (para o linter e para saber quais
// variáveis o contrato precisa ANTES de decidir as cláusulas).
export function camposDaRegra(regra, acc = new Set()) {
  if (!regra) return acc
  if (regra.e || regra.ou) (regra.e || regra.ou).forEach(r => camposDaRegra(r, acc))
  else if (regra.nao) camposDaRegra(regra.nao, acc)
  else acc.add(regra.campo)
  return acc
}

export function validarRegra(regra, caminho = 'regra') {
  const erros = []
  if (!regra) return erros
  if (regra.e || regra.ou) {
    const lista = regra.e || regra.ou
    if (!Array.isArray(lista) || !lista.length) erros.push(`${caminho}: "e"/"ou" precisa de lista não vazia`)
    else lista.forEach((r, i) => erros.push(...validarRegra(r, `${caminho}[${i}]`)))
  } else if (regra.nao) {
    erros.push(...validarRegra(regra.nao, `${caminho}.nao`))
  } else {
    if (!regra.campo) erros.push(`${caminho}: sem "campo"`)
    if (!OPERADORES[regra.op]) erros.push(`${caminho}: operador desconhecido "${regra.op}"`)
  }
  return erros
}
