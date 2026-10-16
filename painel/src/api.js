// Cliente da API do painel. A sessão vai no cookie (HttpOnly): o JS nunca
// vê o token.
//
// Modo suporte: o developer abre uma organização só para leitura; as rotas
// /org/* passam a levar o cabeçalho X-Organizacao.

let orgSuporte = null
export const definirSuporte = (id) => { orgSuporte = id }
export const emSuporte = () => orgSuporte

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

export async function api(caminho, { metodo = 'GET', corpo, arquivo } = {}) {
  const headers = {}
  if (arquivo) headers['content-type'] = 'application/octet-stream'
  else if (corpo !== undefined) headers['content-type'] = 'application/json'
  if (orgSuporte && caminho.startsWith('/org')) headers['x-organizacao'] = orgSuporte
  const r = await fetch(`/painel/api${caminho}`, {
    method: metodo,
    headers,
    body: arquivo ?? (corpo !== undefined ? JSON.stringify(corpo) : undefined),
    credentials: 'same-origin',
  })
  if (r.status === 401 && caminho !== '/sessao' && caminho !== '/eu') window.dispatchEvent(new Event('sessao-expirada'))
  const tipo = r.headers.get('content-type') || ''
  if (!r.ok) {
    const c = tipo.includes('json') ? await r.json() : {}
    throw new ErroApi(r.status, c.erro || `Erro ${r.status}`, c.detalhes)
  }
  return tipo.includes('application/json') ? r.json() : r
}

export async function baixar(caminho, nomePadrao = 'arquivo') {
  const r = await api(caminho)
  const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || nomePadrao
  const url = URL.createObjectURL(await r.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
