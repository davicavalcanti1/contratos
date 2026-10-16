#!/usr/bin/env node
// CLI da Fase 1 — o motor sem tela e sem banco.
//
//   node src/cli.js lint                       confere todos os modelos da biblioteca
//   node src/cli.js gerar <exemplo.json> [dir] gera o PDF (recusa se faltar dado)
//   node src/cli.js exemplos [dir]             gera os exemplos de exemplos/*.json
//   node src/cli.js developer <email> "<nome>"  convida o primeiro developer da plataforma
//                                              (usa DADOS_DIR e BASE_URL, como o servidor)
//
// O arquivo de exemplo traz { modelo, dados }. A organização vem de
// exemplos/_organizacao.json — no produto, ela vem do cadastro do tenant.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { acharModelo, carregarBiblioteca } from './biblioteca.js'
import { lintModelo } from './motor/linter.js'
import { montarContrato } from './motor/montar.js'
import { gerarPdf } from './motor/pdf.js'

const EXEMPLOS = 'exemplos'
const lerJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const [cmd, ...args] = process.argv.slice(2)
const bib = carregarBiblioteca()

const comandos = {
  lint() {
    let falhou = false
    for (const m of bib.modelos) {
      const r = lintModelo(m, bib.indice)
      console.log(`\n${r.ok ? '✔' : '✘'} ${m.chave} v${m.versao} — ${r.combinacoes} combinações de regras conferidas`)
      r.graves.forEach(g => console.log(`  GRAVE  ${g.onde ? `[${g.onde}] ` : ''}${g.msg}`))
      r.avisos.forEach(a => console.log(`  aviso  ${a.onde ? `[${a.onde}] ` : ''}${a.msg}`))
      if (!r.ok) falhou = true
    }
    process.exitCode = falhou ? 1 : 0
  },

  async gerar(arquivo, saida = 'saida') {
    if (!arquivo) throw new Error('uso: gerar <exemplo.json> [dir]')
    const ok = await gerarUm(arquivo, saida)
    process.exitCode = ok ? 0 : 1
  },

  async exemplos(saida = 'saida') {
    const arquivos = readdirSync(EXEMPLOS).filter(f => f.endsWith('.json') && !f.startsWith('_'))
    for (const f of arquivos) await gerarUm(join(EXEMPLOS, f), saida)
  },

  // Produção não cria conta sozinha: o primeiro developer nasce por aqui, com
  // um convite para ele mesmo criar a senha.
  async developer(email, nome) {
    if (!email || !nome) throw new Error('uso: developer <email> "<nome completo>"')
    const { criarRepo } = await import('./armazenamento/repo.js')
    const { criarPlataforma } = await import('./plataforma/plataforma.js')
    const repo = criarRepo({ dir: process.env.DADOS_DIR || join(process.cwd(), 'dados') })
    const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
    const p = criarPlataforma({ repo, notificar: async () => {}, config: { baseUrl } })
    const c = await p.convidar({ nome, email, papel: 'developer' }, { tipo: 'cli' })
    console.log(`Convite criado para ${c.email}. Abra para criar a senha (vale 7 dias):`)
    console.log(c.link)
  },
}

async function gerarUm(arquivo, saida) {
  const { modelo: chave, dados } = lerJson(arquivo)
  const organizacao = lerJson(join(EXEMPLOS, '_organizacao.json'))
  const modelo = acharModelo(bib, chave)
  const r = montarContrato({ modelo, biblioteca: bib.indice, dados: { organizacao, ...dados } })
  const nome = basename(arquivo, '.json')

  if (!r.ok) {
    console.log(`\n✘ ${nome}: não vai para assinatura`)
    r.faltando.forEach(f => console.log(`  falta     ${f.variavel} — ${f.motivo}`))
    r.invalidos.forEach(i => console.log(`  inválido  ${i.variavel} — ${i.motivo}`))
    return false
  }

  const { buffer, sha256 } = await gerarPdf(r.contrato)
  mkdirSync(saida, { recursive: true })
  writeFileSync(join(saida, `${nome}.pdf`), buffer)
  writeFileSync(join(saida, `${nome}.json`), JSON.stringify({ ...r.contrato, pdf_sha256: sha256 }, null, 2))
  const criticas = r.contrato.clausulas.filter(c => c.critica).map(c => c.numero)
  console.log(`\n✔ ${nome}: ${r.contrato.clausulas.length} cláusulas, críticas (bula) ${criticas.join(', ')}`)
  console.log(`  conteúdo ${r.contrato.conteudo_sha256.slice(0, 16)}…  pdf ${sha256.slice(0, 16)}…  → ${join(saida, nome)}.pdf`)
  return true
}

const fn = comandos[cmd]
if (!fn) {
  console.log('comandos: lint | gerar <exemplo.json> [dir] | exemplos [dir]')
  process.exitCode = 1
} else {
  Promise.resolve(fn(...args)).catch(e => { console.error(e.message); process.exitCode = 1 })
}
