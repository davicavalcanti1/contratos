// Screenshot + checagem de layout de uma página.
// uso: node shot.mjs <url> <nome> [--dark] [--widths=390,1440] [--viewport]
//                    [--click=sel1;sel2] [--el=seletor] [--login=email:senha]
//                    [--type=seletor=texto;...]
// Gera <nome>-<largura>.png em ../shots e imprime: overflow horizontal,
// erros de console, requisições falhas e altura da página.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const saida = join(aqui, 'shots')
mkdirSync(saida, { recursive: true })

const [url, nome = 'pagina', ...flags] = process.argv.slice(2)
const dark = flags.includes('--dark')
const full = !flags.includes('--viewport')
const flag = (n) => { const f = flags.find(f => f.startsWith(`--${n}=`)); return f ? f.slice(n.length + 3) : undefined }
const widths = (flag('widths') || '390,1440').split(',').map(Number)
const acoes = flag('click')
const alvo = flag('el')
const login = flag('login')
const digitar = flag('type')
const espera = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--hide-scrollbars'],
})
try {
  for (const w of widths) {
    const page = await browser.newPage()
    const erros = [], falhas = []
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erros.push(`${m.type()}: ${m.text()}`) })
    page.on('pageerror', e => erros.push(`pageerror: ${e.message}`))
    page.on('requestfailed', r => falhas.push(`${r.url()} ${r.failure()?.errorText}`))
    page.on('response', r => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`) })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }])
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })

    if (login) {
      const [email, senha] = login.split(':')
      const origem = new URL(url).origin
      await page.goto(`${origem}/painel/entrar`, { waitUntil: 'networkidle0', timeout: 30000 })
      // O navegador é o mesmo para todas as larguras: na segunda, a sessão já existe.
      if (await page.$('input[type=email]')) {
        await page.type('input[type=email]', email)
        await page.type('input[type=password]', senha)
        await page.click('form button.botao')
        await page.waitForFunction(() => !location.pathname.endsWith('/entrar'), { timeout: 15000 }).catch(() => {})
        await espera(400)
      }
    }

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    await page.evaluate(() => document.fonts.ready)
    const arquivo = flag('file')
    if (arquivo) { const i = arquivo.indexOf('='); const el = await page.$(arquivo.slice(0, i)); await el.uploadFile(arquivo.slice(i + 1)); await espera(400) }
    const selecionar = flag('select')
    if (selecionar) for (const par of selecionar.split(';')) { const i = par.indexOf('='); await page.select(par.slice(0, i), par.slice(i + 1)); await espera(500) }
    if (digitar) for (const par of digitar.split(';')) { const i = par.indexOf('='); await page.type(par.slice(0, i), par.slice(i + 1)); await espera(150) }
    if (digitar) await espera(600)
    if (acoes) for (const sel of acoes.split(';')) { await page.click(sel); await espera(400) }
    await espera(300)
    const m = await page.evaluate(() => {
      const de = document.documentElement
      const largos = []
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.right > de.clientWidth + 1 && r.width > 0) largos.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} right=${Math.round(r.right)}`)
      }
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, altura: de.scrollHeight, largos: largos.slice(0, 8), url: location.href }
    })
    const arq = join(saida, `${nome}-${w}${dark ? '-dark' : ''}.png`)
    if (alvo) { const el = await page.$(alvo); await el.scrollIntoView(); await espera(300); await el.screenshot({ path: arq }) } else await page.screenshot({ path: arq, fullPage: full })
    console.log(`\n[${w}px${dark ? ' dark' : ''}] ${arq}  (${m.url})`)
    console.log(`  altura ${m.altura}px · scrollWidth ${m.scrollWidth} / clientWidth ${m.clientWidth} ${m.scrollWidth > m.clientWidth ? '⚠ OVERFLOW' : 'ok'}`)
    if (m.largos.length) console.log('  elementos além da borda:\n   ' + m.largos.join('\n   '))
    if (erros.length) console.log('  console:\n   ' + erros.join('\n   '))
    if (falhas.length) console.log('  requisições:\n   ' + falhas.join('\n   '))
    await page.close()
  }
} finally {
  await browser.close()
}
