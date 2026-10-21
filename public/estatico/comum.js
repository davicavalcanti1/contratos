// Utilidades das páginas. Sem dependências: a tela de assinatura abre no
// celular, muitas vezes em 4G ruim, e precisa carregar rápido.

export const $ = (s, el = document) => el.querySelector(s)

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro || `Erro ${status}`)
    this.status = status
    this.detalhes = corpo?.detalhes
  }
}

export async function api(caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const r = await fetch(caminho, {
    method: metodo,
    headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...cabecalhos },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const tipo = r.headers.get('content-type') || ''
  if (!r.ok) throw new ErroApi(r.status, tipo.includes('json') ? await r.json() : null)
  if (tipo.includes('application/pdf')) return r
  return tipo.includes('json') ? r.json() : r.text()
}

export async function baixar(resposta, nomePadrao) {
  const nome = /filename="([^"]+)"/.exec(resposta.headers.get('content-disposition') || '')?.[1] || nomePadrao
  const url = URL.createObjectURL(await resposta.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function dataHora(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

export function mostrarErro(el, e) {
  el.textContent = e?.message || String(e)
  el.hidden = false
}

// Marca da organização: logotipo acima do "Enviado por" e a cor de destaque
// no lugar do azul de ação. A casca continua branca.
export function aplicarMarca(marca) {
  if (!marca) return
  if (/^#[0-9a-f]{6}$/i.test(marca.cor || '')) {
    const r = document.documentElement.style
    r.setProperty('--acao', marca.cor)
    r.setProperty('--acao-forte', misturar(marca.cor, '#000000', 0.18))
    r.setProperty('--acao-claro', misturar(marca.cor, '#ffffff', 0.88))
  }
  if (marca.logo_url && /^\/marca\/[\w.-]+$/.test(marca.logo_url)) {
    const alvo = document.querySelector('.topo .dentro > div')
    if (alvo && !alvo.querySelector('.logo-org')) {
      alvo.prepend(Object.assign(document.createElement('img'), { src: marca.logo_url, alt: marca.nome || '', className: 'logo-org' }))
    }
  }
}
function misturar(a, b, p) {
  const ca = parseInt(a.slice(1), 16), cb = parseInt(b.slice(1), 16)
  const canal = (d) => Math.round(((ca >> d) & 255) * (1 - p) + ((cb >> d) & 255) * p)
  return '#' + [16, 8, 0].map(d => canal(d).toString(16).padStart(2, '0')).join('')
}

// Armazenamento local pode não existir (aba privada, bloqueio): tudo em try.
export const guardar = {
  ler(k) { try { return sessionStorage.getItem(k) } catch { return null } },
  gravar(k, v) { try { sessionStorage.setItem(k, v) } catch {} },
  apagar(k) { try { sessionStorage.removeItem(k) } catch {} },
}

export async function sha256Arquivo(arquivo) {
  const buf = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Roseta de guilhoché, a mesma fórmula do selo no PDF (src/motor/estilo-pdf.js).
export function rosetaSvg({ curvas = 7 } = {}) {
  const raio = 48, c = 50, caminhos = []
  for (let k = 0; k < curvas; k++) {
    const R = raio * (0.62 + k * 0.04), r = raio * 0.18, d = raio * (0.2 + k * 0.018), s = raio / (R + r + d)
    let p = ''
    for (let t = 0; t <= Math.PI * 14 + 0.001; t += 0.05) {
      const x = c + ((R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t)) * s
      const y = c + ((R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)) * s
      p += `${p ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }
    caminhos.push(`<path d="${p}" stroke-opacity="${(0.35 + (k % 3) * 0.15).toFixed(2)}"/>`)
  }
  return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width=".35" aria-hidden="true">${caminhos.join('')}</svg>`
}
