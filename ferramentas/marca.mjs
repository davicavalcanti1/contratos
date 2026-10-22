#!/usr/bin/env node
// Gera as peças da marca em PNG a partir de marca/marca.html, com as fontes
// do produto: logo horizontal, logo empilhado, símbolo 512, avatar 1080×1080
// (Instagram) e capa 1500×500. Saída em marca/.
//
//   node ferramentas/marca.mjs
//
// O símbolo vetorial é marca/simbolo.svg (sem fonte). Ver docs/MARCA.md.

import puppeteer from 'puppeteer-core'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAIZ = resolve(import.meta.dirname, '..')
const dir = join(RAIZ, 'marca')
const fontesDir = pathToFileURL(join(RAIZ, 'public', 'estatico', 'fontes')).href
const fontesCss = readFileSync(join(RAIZ, 'public', 'estatico', 'fontes.css'), 'utf8').replaceAll('/estatico/fontes/', `${fontesDir}/`)
const html = readFileSync(join(dir, 'marca.html'), 'utf8').replace(/<link rel="stylesheet" href="[^"]*fontes\.css">/, `<style>${fontesCss}</style>`)
const temp = join(dir, '.render.html')
writeFileSync(temp, html)

const PECAS = [
  ['#logo', 'logo.png', 1],
  ['#empilhado', 'logo-empilhado.png', 1],
  ['#simbolo-512', 'simbolo-512.png', 1],
  ['#avatar', 'avatar.png', 1],
  ['#capa', 'capa.png', 1],
]

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1700, height: 1400, deviceScaleFactor: 2 })
  await page.goto(pathToFileURL(temp).href, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  for (const [sel, nome, escala] of PECAS) {
    const el = await page.$(sel)
    const box = await el.boundingBox()
    await el.screenshot({ path: join(dir, nome), omitBackground: sel === '#simbolo-512' })
    console.log(`  marca/${nome}  ${Math.round(box.width)}×${Math.round(box.height)}${escala !== 1 ? ` @${escala}x` : ''}`)
  }
} finally {
  await browser.close()
  try { unlinkSync(temp) } catch { /* ok */ }
}
