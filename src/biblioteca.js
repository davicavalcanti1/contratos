// Biblioteca em arquivo enquanto não há banco. A forma (cláusulas versionadas,
// modelos que apontam para chave@versão) é a que vai virar tabela.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexarBiblioteca } from './motor/montar.js'

export const DIR_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..', 'biblioteca')

const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

export function carregarBiblioteca(dir = DIR_PADRAO) {
  const clausulas = lerJson(join(dir, 'clausulas.json'))
  const modelos = readdirSync(join(dir, 'modelos'))
    .filter(f => f.endsWith('.json'))
    .map(f => lerJson(join(dir, 'modelos', f)))
  return { clausulas, indice: indexarBiblioteca(clausulas), modelos }
}

export function acharModelo(bib, chave) {
  const m = bib.modelos.find(x => x.chave === chave)
  if (!m) throw new Error(`modelo "${chave}" não existe (há: ${bib.modelos.map(x => x.chave).join(', ')})`)
  return m
}
