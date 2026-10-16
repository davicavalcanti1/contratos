// Armazenamento SEM banco (Fase 2). Coleções em memória, opcionalmente
// persistidas em JSON numa pasta, e arquivos (PDFs) em disco.
//
// A interface é a que o Postgres vai implementar depois: inserir, obter,
// atualizar, listar, mais arquivos. Duas garantias já moram AQUI, e não só no
// serviço, para que trocar o armazenamento não as perca:
//   - `eventos` é append-only: atualizar ou apagar evento lança erro;
//   - arquivo gravado não é sobrescrito (o PDF original é prova).

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const COLECOES = ['contratos', 'signatarios', 'eventos', 'sessoes', 'caixa', 'lotes', 'planilhas', 'mapeamentos']
const SO_ANEXA = new Set(['eventos'])

export function criarRepo({ dir = null } = {}) {
  const dados = Object.fromEntries(COLECOES.map(c => [c, new Map()]))
  const arquivos = new Map()

  if (dir) {
    mkdirSync(join(dir, 'arquivos'), { recursive: true })
    for (const c of COLECOES) {
      const p = join(dir, `${c}.json`)
      if (existsSync(p)) for (const o of JSON.parse(readFileSync(p, 'utf8'))) dados[c].set(o.id, o)
    }
  }

  // Grava a coleção inteira, via arquivo temporário + rename: um crash no
  // meio não deixa JSON pela metade.
  const persistir = (c) => {
    if (!dir) return
    const p = join(dir, `${c}.json`)
    writeFileSync(`${p}.tmp`, JSON.stringify([...dados[c].values()], null, 1))
    renameSync(`${p}.tmp`, p)
  }

  const col = (c) => {
    if (!dados[c]) throw new Error(`coleção desconhecida: ${c}`)
    return dados[c]
  }
  const copia = (o) => (o ? structuredClone(o) : null)

  return {
    inserir(c, obj) {
      const o = { id: obj.id || randomUUID(), ...obj }
      if (col(c).has(o.id)) throw new Error(`${c}: id duplicado ${o.id}`)
      col(c).set(o.id, structuredClone(o))
      persistir(c)
      return copia(o)
    },
    obter(c, id) {
      return copia(col(c).get(id))
    },
    atualizar(c, id, patch) {
      if (SO_ANEXA.has(c)) throw new Error(`${c} é append-only: não se altera registro`)
      const atual = col(c).get(id)
      if (!atual) throw new Error(`${c}: ${id} não existe`)
      const novo = { ...atual, ...structuredClone(patch), id }
      col(c).set(id, novo)
      persistir(c)
      return copia(novo)
    },
    remover(c, id) {
      if (SO_ANEXA.has(c)) throw new Error(`${c} é append-only: não se apaga registro`)
      col(c).delete(id)
      persistir(c)
    },
    listar(c, filtro = () => true) {
      return [...col(c).values()].filter(filtro).map(copia)
    },

    salvarArquivo(nome, buffer) {
      if (arquivos.has(nome) || (dir && existsSync(join(dir, 'arquivos', nome)))) {
        throw new Error(`arquivo ${nome} já existe e não é sobrescrito`)
      }
      if (dir) writeFileSync(join(dir, 'arquivos', nome), buffer)
      else arquivos.set(nome, Buffer.from(buffer))
      return nome
    },
    lerArquivo(nome) {
      if (dir) {
        const p = join(dir, 'arquivos', nome)
        return existsSync(p) ? readFileSync(p) : null
      }
      return arquivos.get(nome) || null
    },
  }
}
