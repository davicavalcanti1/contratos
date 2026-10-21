// Percorre a tela pública de assinatura e fotografa cada etapa.
// uso: node fluxo-assinar.mjs <link> <prefixo> [--widths=390,1440] [--dark] [--assinar]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const saida = join(aqui, 'shots')
mkdirSync(saida, { recursive: true })
const [link, prefixo = 'assinar', ...flags] = process.argv.slice(2)
const flag = (n) => { const f = flags.find(f => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : undefined }
const widths = (flag('widths') || '390').split(',').map(Number)
const dark = flags.includes('--dark')
const assinar = flags.includes('--assinar')
const origem = new URL(link).origin
const espera = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] })
try {
  for (const w of widths) {
    const page = await browser.newPage()
    const erros = []
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`))
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text()) })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }])
    await page.setViewport({ width: w, height: 844, deviceScaleFactor: 1 })
    // sessão limpa a cada largura
    await page.goto(link, { waitUntil: 'networkidle0' })
    await page.evaluate(() => sessionStorage.clear())
    await page.goto(link, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts.ready)
    const foto = async (nome, full = false) => { const p = join(saida, `${prefixo}-${nome}-${w}${dark ? '-dark' : ''}.png`); await page.screenshot({ path: p, fullPage: full }); console.log(`  ${nome}: ${p}`) }
    console.log(`\n[${w}px]`)
    await foto('1-identificar')

    await page.click('#btn-pedir')
    await espera(600)
    const estado = await (await fetch(`${origem}/dev/api/estado`)).json()
    const para = await page.$eval('#codigo-destino', el => el.textContent)
    const codigo = estado.caixa.filter(m => m.meta?.tipo === 'codigo').sort((a, b) => b.em.localeCompare(a.em))[0].meta.codigo
    console.log(`  destino: ${para.trim()} · código ${codigo}`)
    await foto('2-codigo')
    await page.type('#codigo', codigo)
    await espera(900)
    if (!(await page.$eval('#tela-ler', el => !el.hidden))) { await page.click('#form-codigo button[type=submit]'); await espera(900) }
    await foto('3-ler-topo')
    await foto('3-ler-tudo', true)

    // ciências e leitura até o fim
    for (const b of await page.$$('[data-ciencia]')) { await b.scrollIntoView(); await espera(200); await b.click(); await espera(350) }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await espera(900)
    await foto('4-ler-pronto')
    await page.click('#btn-ir-assinar')
    await espera(600)
    await foto('5-assinar', true)

    if (assinar) {
      const nome = await page.$eval('#nome-dica', el => el.textContent.split(': ')[1])
      await page.type('#nome', nome)
      await page.click('#concordo')
      await page.click('#btn-assinar')
      await espera(2500)
      await foto('6-fim', true)
    }
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    console.log(`  scrollWidth ${m.sw} / ${m.cw} ${m.sw > m.cw ? '⚠ OVERFLOW' : 'ok'}`)
    if (erros.length) console.log('  erros:\n   ' + erros.join('\n   '))
    await page.close()
  }
} finally { await browser.close() }
