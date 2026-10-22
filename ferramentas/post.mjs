#!/usr/bin/env node
// Renderiza um post do Instagram (carrossel 1080×1350) a partir do post.html
// da pasta: cada elemento `.slide` vira slide-N.png na mesma pasta.
//
//   node ferramentas/post.mjs marca/posts/001-apresentacao [--dpr=2]   (2x: 2160×2700, o Instagram reduz sem borrar)
//
// {{NOME}} e {{HANDLE}} no HTML são trocados antes de renderizar. As fontes
// são as do produto (public/estatico/fontes.css). Ver docs/MARCA.md.

import puppeteer from 'puppeteer-core'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [pasta, ...flags] = process.argv.slice(2)
if (!pasta) { console.error('uso: node ferramentas/post.mjs <pasta> [--nome=X] [--handle=@x]'); process.exit(2) }
const flag = (n, padrao) => { const f = flags.find(f => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : padrao }
const nome = flag('nome', 'BullaCheck')
const handle = flag('handle', '@bullacheck')

const dir = resolve(pasta)
// As fontes do produto: fontes.css aponta para /estatico/fontes/, que só existe
// com o servidor no ar; aqui o CSS entra inline apontando para o arquivo.
const RAIZ = resolve(import.meta.dirname, '..')
const fontesDir = pathToFileURL(join(RAIZ, 'public', 'estatico', 'fontes')).href
const fontesCss = readFileSync(join(RAIZ, 'public', 'estatico', 'fontes.css'), 'utf8').replaceAll('/estatico/fontes/', `${fontesDir}/`)
const html = readFileSync(join(dir, 'post.html'), 'utf8')
  .replace(/<link rel="stylesheet" href="[^"]*fontes\.css">/, `<style>${fontesCss}</style>`)
  .replaceAll('{{NOME}}', nome).replaceAll('{{HANDLE}}', handle)
const temp = join(dir, '.render.html')
writeFileSync(temp, html)

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars', '--allow-file-access-from-files'] })
try {
  const page = await browser.newPage()
  const erros = []
  page.on('pageerror', e => erros.push(e.message))
  page.on('requestfailed', r => erros.push(`falhou: ${r.url()}`))
  await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: Number(flag('dpr', 2)) })
  await page.goto(pathToFileURL(temp).href, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  const slides = await page.$$('.slide')
  let i = 0
  for (const s of slides) {
    i++
    const caminho = join(dir, `slide-${i}.png`)
    const box = await s.boundingBox()
    if (Math.round(box.width) !== 1080 || ![1350, 1920, 1080].includes(Math.round(box.height))) console.warn(`  ⚠ slide ${i} mede ${Math.round(box.width)}×${Math.round(box.height)} (esperado 1080×1350, 1080×1920 ou 1080×1080)`)
    const estouro = await s.evaluate(el => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    if (estouro) console.warn(`  ⚠ slide ${i}: conteúdo passa da borda`)
    await s.screenshot({ path: caminho })
    console.log(`  ${caminho}`)
  }
  if (erros.length) console.log('  erros:\n   ' + erros.join('\n   '))
  console.log(`${i} slide(s) · nome "${nome}" · ${handle}`)
} finally {
  await browser.close()
  try { (await import('node:fs')).unlinkSync(temp) } catch { /* ok */ }
}
