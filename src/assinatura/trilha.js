// Trilha de eventos encadeada por hash. Cada evento carrega o hash do anterior
// do MESMO contrato; tirar, trocar ou reordenar um evento quebra a corrente
// dali em diante, e `verificarTrilha` aponta onde.
//
// Não é prova contra quem controla o servidor (ele poderia reescrever a
// corrente inteira). Essa garantia vem do carimbo do tempo de terceiro (ACT
// ICP-Brasil, Fase 6) sobre o hash final. Ver docs/VALIDADE-JURIDICA.md §3.

import { createHash } from 'node:crypto'

export const GENESE = '0'.repeat(64)

// JSON com chaves em ordem: o mesmo evento sempre dá o mesmo hash.
export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

export function hashEvento(ev) {
  const { hash, ...resto } = ev
  return createHash('sha256').update(canonico(resto)).digest('hex')
}

export function criarTrilha(repo, agora = () => new Date()) {
  const doContrato = (contratoId) =>
    repo.listar('eventos', e => e.contrato_id === contratoId).sort((a, b) => a.seq - b.seq)

  return {
    registrar(contratoId, tipo, { ator = 'sistema', dados = {}, ip = null, user_agent = null } = {}) {
      const anteriores = doContrato(contratoId)
      const ultimo = anteriores.at(-1)
      const ev = {
        contrato_id: contratoId,
        seq: anteriores.length + 1,
        tipo,
        ator,
        dados,
        ip,
        user_agent,
        em: agora().toISOString(),
        hash_anterior: ultimo ? ultimo.hash : GENESE,
      }
      ev.hash = hashEvento(ev)
      return repo.inserir('eventos', ev)
    },
    listar: doContrato,
    verificar(contratoId) {
      return verificarTrilha(doContrato(contratoId))
    },
  }
}

export function verificarTrilha(eventos) {
  let anterior = GENESE
  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i]
    const { id, ...semId } = ev
    if (ev.seq !== i + 1) return { integra: false, quebra_em: i + 1, motivo: 'sequência fora de ordem ou evento faltando' }
    if (ev.hash_anterior !== anterior) return { integra: false, quebra_em: ev.seq, motivo: 'elo com o evento anterior não confere' }
    if (hashEvento(semId) !== ev.hash) return { integra: false, quebra_em: ev.seq, motivo: 'conteúdo do evento foi alterado' }
    anterior = ev.hash
  }
  return { integra: true, eventos: eventos.length, hash_final: anterior }
}
