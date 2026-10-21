#!/usr/bin/env node
// Legislação local: baixa (ou rebaixa) as normas do catálogo legislacao/normas.json
// a partir de github.com/ctresb/leis e confere que toda base legal das cláusulas
// aponta para artigo que existe.
//
//   node ferramentas/legislacao.mjs atualizar [sigla…]   baixa as normas (todas, ou só as siglas dadas);
//                                                        se um artigo citado nas cláusulas mudou de texto, avisa
//   node ferramentas/legislacao.mjs conferir             resolve a base legal de cada cláusula da semente
//   node ferramentas/legislacao.mjs ver "CC art. 598"    mostra o que a bula vai mostrar
//
// Só precisa de rede o `atualizar`. Ver docs/LEGISLACAO.md.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analisarCitacao, carregarLegislacao, DIR_PADRAO, indexarNorma } from '../src/legislacao/legislacao.js'

const [cmd, ...args] = process.argv.slice(2)
const dir = process.env.LEGISLACAO_DIR || DIR_PADRAO
const catalogo = JSON.parse(readFileSync(join(dir, 'normas.json'), 'utf8'))
const sha256 = (s) => createHash('sha256').update(String(s).replace(/
/g, '
')).digest('hex') // o git pode trocar LF por CRLF no Windows
const lerClausulas = () => JSON.parse(readFileSync(join(dir, '..', 'biblioteca', 'clausulas.json'), 'utf8'))
const textoDoArtigo = (idx, num) => idx?.artigos.get(num)?.linhas.map(l => `${l.rotulo} ${l.texto}`).join('\n') || null

// Artigos que as cláusulas da semente citam, por norma: é o que vale conferir
// quando a norma muda.
function citadosPorNorma(leg) {
  const mapa = new Map()
  for (const c of lerClausulas()) {
    for (const t of analisarCitacao(c.base_legal || '')) {
      const n = leg.acharNorma(t.norma)
      if (!n) continue
      const idx = leg.indice(n.sigla)
      for (const a of t.artigos) {
        const nums = a.ate && idx ? idx.ordem.slice(idx.ordem.indexOf(a.de), idx.ordem.indexOf(a.ate) + 1) : [a.de]
        for (const num of nums) { if (!mapa.has(n.arquivo)) mapa.set(n.arquivo, new Map()); mapa.get(n.arquivo).set(num, c.chave) }
      }
    }
  }
  return mapa
}

const comandos = {
  async atualizar(...siglas) {
    const leg = carregarLegislacao(dir)
    const citados = citadosPorNorma(leg)
    const fontesCaminho = join(dir, 'fontes.json')
    const fontes = existsSync(fontesCaminho) ? JSON.parse(readFileSync(fontesCaminho, 'utf8')) : { normas: {} }
    const quer = siglas.length ? new Set(siglas.map(s => s.toLowerCase())) : null
    let mudancas = 0
    for (const n of catalogo.normas) {
      if (quer && !quer.has(n.sigla.toLowerCase()) && !quer.has(n.arquivo.replace(/\.md$/, ''))) continue
      const url = catalogo.raiz_bruta + n.caminho
      process.stdout.write(`${n.sigla.padEnd(12)} ${n.titulo.padEnd(36)} `)
      const r = await fetch(url)
      if (!r.ok) { console.log(`FALHOU ${r.status} ${url}`); process.exitCode = 1; continue }
      const novo = await r.text()
      const hash = sha256(novo)
      const caminho = join(dir, n.arquivo)
      const antigo = existsSync(caminho) ? readFileSync(caminho, 'utf8') : null
      const idxNovo = indexarNorma(novo)
      if (!idxNovo.artigos.size) { console.log(`SEM ARTIGOS — formato mudou? não gravei`); process.exitCode = 1; continue }
      if (antigo && sha256(antigo) === hash) { console.log(`igual (${idxNovo.artigos.size} artigos, coleta ${idxNovo.meta.baixado_em || '?'})`); continue }
      // Mudou: o que importa é se algum artigo citado mudou de texto.
      const avisos = []
      if (antigo) {
        const idxAntigo = indexarNorma(antigo)
        for (const [num, clausula] of citados.get(n.arquivo) || []) {
          const a = textoDoArtigo(idxAntigo, num), b = textoDoArtigo(idxNovo, num)
          if (a !== b) avisos.push(`  ! art. ${num} mudou de texto (cláusula "${clausula}") — releia a cláusula`)
        }
        if (idxAntigo.meta.revogada !== idxNovo.meta.revogada) avisos.push(`  ! situação mudou: revogada=${idxNovo.meta.revogada}`)
      }
      writeFileSync(caminho, novo)
      fontes.normas[n.arquivo] = { url, urn: idxNovo.meta.urn || null, fonte: idxNovo.meta.fonte || null, versao_texto: idxNovo.meta.versao_texto || null, coletado_em: idxNovo.meta.baixado_em || null, revogada: idxNovo.meta.revogada === true, artigos: idxNovo.artigos.size, sha256: hash, atualizado_em: new Date().toISOString().slice(0, 10) }
      mudancas++
      console.log(`${antigo ? 'ATUALIZADA' : 'baixada'} (${idxNovo.artigos.size} artigos, coleta ${idxNovo.meta.baixado_em || '?'})`)
      avisos.forEach(a => console.log(a))
    }
    fontes.repositorio = catalogo.repositorio
    fontes.atualizado_em = new Date().toISOString().slice(0, 10)
    writeFileSync(fontesCaminho, JSON.stringify(fontes, null, 2) + '\n')
    console.log(`\n${mudancas} arquivo(s) gravado(s); fontes.json atualizado.`)
  },

  conferir() {
    const leg = carregarLegislacao(dir)
    let problemas = 0
    for (const c of lerClausulas()) {
      if (!c.base_legal) { console.log(`aviso  ${c.chave}: sem base legal`); continue }
      for (const item of leg.resolver(c.base_legal)) {
        for (const p of item.problemas) { console.log(`GRAVE  ${c.chave}: ${p}`); problemas++ }
      }
    }
    console.log(problemas ? `\n${problemas} problema(s).` : '\nToda base legal resolve.')
    process.exitCode = problemas ? 1 : 0
  },

  ver(citacao) {
    if (!citacao) throw new Error('uso: ver "CC art. 598"')
    const leg = carregarLegislacao(dir)
    for (const f of leg.fundamentos(citacao)) {
      console.log(`\n${f.rotulo}${f.norma ? ` — ${f.norma.titulo}${f.norma.vigente === false ? ' (REVOGADA)' : ''}` : ' — norma desconhecida'}`)
      if (f.observacao) console.log(`  (${f.observacao})`)
      for (const a of f.artigos) {
        console.log(`  Art. ${a.numero}${a.revogado ? ' [revogado]' : ''}`)
        for (const l of a.linhas) console.log(`    ${l.rotulo === 'caput' ? '' : `${l.rotulo} `}${l.texto}${l.nota ? `  (${l.nota})` : ''}`)
      }
      if (f.norma?.fonte) console.log(`  fonte: ${f.norma.fonte} · coleta ${f.norma.coletado_em}`)
    }
  },
}

if (!comandos[cmd]) {
  console.error('uso: node ferramentas/legislacao.mjs <atualizar [sigla…] | conferir | ver "citação">')
  process.exit(2)
}
await comandos[cmd](...args)
