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
