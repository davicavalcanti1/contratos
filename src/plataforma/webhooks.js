// Webhooks de saída: avisam o sistema do cliente (ex.: ExameQR) quando algo
// acontece com um contrato, sem ele precisar ficar consultando.
//
// Entrega:
//   POST <url>  corpo = { id, tipo, criado_em, dados }
//   X-Contratos-Evento:     o tipo
//   X-Contratos-Entrega:    id da entrega (o mesmo nas novas tentativas: idempotência)
//   X-Contratos-Assinatura: t=<unix>,v1=<HMAC-SHA256(segredo, "<t>.<corpo>")>
//
// 2xx = entregue. Qualquer outra coisa (inclusive timeout) tenta de novo:
// 1 min, 5 min, 30 min, 2 h, 6 h. Depois disso, "falhou" — e fica no painel
// para reenviar à mão.
//
// SSRF: em produção a URL tem de ser https e não pode apontar para a rede
// interna. A checagem resolve o DNS na hora da ENTREGA, não só no cadastro
// (um domínio pode passar a apontar para 127.0.0.1 depois).

import { createHmac, randomBytes } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ErroNegocio } from '../assinatura/servico.js'

export const EVENTOS_WEBHOOK = {
  'contrato.assinado': 'Contrato assinado por todos (selado)',
  'signatario.assinou': 'Uma pessoa assinou',
  'contrato.recusado': 'Contrato recusado',
  'contrato.expirando': 'Prazo de assinatura termina em 1 dia e ainda faltam assinaturas',
  'contrato.expirado': 'Prazo de assinatura vencido',
  'contrato.cancelado': 'Contrato cancelado',
  'contrato.aditado': 'Termo aditivo assinado (prazo, valor ou objeto mudou)',
  'contrato.distratado': 'Distrato assinado (contrato encerrado por acordo)',
  'contrato.vencendo': 'Contrato vence em 30 ou 7 dias',
  'contrato.reajuste_devido': 'Reajuste anual em 30 dias',
  'contrato.encerrado': 'Contrato terminou no prazo',
}
export const ESPERAS_S = [60, 300, 1800, 7200, 21600]
const TIMEOUT_MS = 10_000

export function assinar(segredo, t, corpo) {
  return createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex')
}

export function ipPrivado(ip) {
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase()
    if (x === '::1' || x === '::') return true
    if (x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd')) return true
    const v4 = x.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return v4 ? ipPrivado(v4[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export function criarWebhooks({ repo, producao = false, agora = () => new Date(), fetchFn = globalThis.fetch, resolver = lookup, log = true }) {
  const agoraIso = () => agora().toISOString()
  let timer = null
  let processando = false

  async function validarUrl(bruta) {
    let u
    try { u = new URL(String(bruta)) } catch { throw new ErroNegocio(400, 'URL inválida.') }
    if (!['https:', 'http:'].includes(u.protocol)) throw new ErroNegocio(400, 'A URL precisa ser http(s).')
    if (producao && u.protocol !== 'https:') throw new ErroNegocio(400, 'Em produção a URL precisa ser https.')
    if (u.username || u.password) throw new ErroNegocio(400, 'Não coloque usuário e senha na URL; use o segredo do webhook.')
    if (!producao) return u
    const host = u.hostname.replace(/^\[|\]$/g, '')
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new ErroNegocio(400, 'A URL não pode apontar para a rede interna.')
    const enderecos = isIP(host) ? [{ address: host }] : await resolver(host, { all: true }).catch(() => { throw new ErroNegocio(400, `Não consegui resolver ${host}.`) })
    if (enderecos.some(e => ipPrivado(e.address))) throw new ErroNegocio(400, 'A URL não pode apontar para a rede interna.')
    return u
  }

  // ── Cadastro ──────────────────────────────────────────────────────────────

  async function criar(orgId, { url, eventos, descricao }) {
    await validarUrl(url)
    const evs = validarEventos(eventos)
    return publico(repo.inserir('webhooks', {
      organizacao_id: orgId, url: String(url), eventos: evs, descricao: String(descricao || '').trim() || null,
      segredo: `whsec_${randomBytes(24).toString('base64url')}`, ativo: true, criado_em: agoraIso(),
    }), true)
  }

  async function atualizar(orgId, id, { url, eventos, ativo, descricao, rotacionar_segredo }) {
    const w = doOrg(orgId, id)
    const patch = {}
    if (url !== undefined) { await validarUrl(url); patch.url = String(url) }
    if (eventos !== undefined) patch.eventos = validarEventos(eventos)
    if (ativo !== undefined) patch.ativo = !!ativo
    if (descricao !== undefined) patch.descricao = String(descricao || '').trim() || null
    if (rotacionar_segredo) patch.segredo = `whsec_${randomBytes(24).toString('base64url')}`
    return publico(repo.atualizar('webhooks', w.id, patch), !!rotacionar_segredo)
  }

  function remover(orgId, id) {
    doOrg(orgId, id)
    repo.remover('webhooks', id)
  }

  function listar(orgId) {
    return repo.listar('webhooks', w => w.organizacao_id === orgId).map(w => {
      const entregas = repo.listar('entregas', e => e.webhook_id === w.id)
      return { ...publico(w), falhas: entregas.filter(e => e.status === 'falhou').length, pendentes: entregas.filter(e => e.status === 'pendente').length }
    })
  }

  // O segredo aparece para o administrador quando ele pede (precisa dele para
  // conferir a assinatura do lado de lá); não vai em listagem.
  function segredo(orgId, id) {
    return { segredo: doOrg(orgId, id).segredo }
  }

  function doOrg(orgId, id) {
    const w = repo.obter('webhooks', id)
    if (!w || w.organizacao_id !== orgId) throw new ErroNegocio(404, 'Webhook não encontrado.')
    return w
  }

  // ── Emissão e entrega ─────────────────────────────────────────────────────

  function emitir(orgId, tipo, dados) {
    if (!EVENTOS_WEBHOOK[tipo]) return []
    const evento = { id: `evt_${randomBytes(12).toString('base64url')}`, tipo, criado_em: agoraIso(), dados }
    return repo.listar('webhooks', w => w.organizacao_id === orgId && w.ativo && w.eventos.includes(tipo)).map(w =>
      repo.inserir('entregas', {
        webhook_id: w.id, organizacao_id: orgId, evento, status: 'pendente', tentativas: 0,
        proxima_em: agoraIso(), criada_em: agoraIso(), historico: [],
      }))
  }

  async function entregar(e) {
    const w = repo.obter('webhooks', e.webhook_id)
    if (!w) return repo.atualizar('entregas', e.id, { status: 'falhou', motivo: 'webhook removido' })
    const corpo = JSON.stringify(e.evento)
    const t = Math.floor(agora().getTime() / 1000)
    let resultado
    try {
      await validarUrl(w.url)
      const ctrl = new AbortController()
      const relogio = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      try {
        const r = await fetchFn(w.url, {
          method: 'POST',
          redirect: 'manual', // redirecionar para a rede interna é o truque clássico de SSRF
          signal: ctrl.signal,
          headers: {
            'content-type': 'application/json',
            'user-agent': 'contratos-saas-webhook/1',
            'x-contratos-evento': e.evento.tipo,
            'x-contratos-entrega': e.id,
            'x-contratos-assinatura': `t=${t},v1=${assinar(w.segredo, t, corpo)}`,
          },
          body: corpo,
        })
        const texto = (await r.text().catch(() => '')).slice(0, 300)
        resultado = { ok: r.status >= 200 && r.status < 300, codigo: r.status, resposta: texto }
      } finally { clearTimeout(relogio) }
    } catch (err) {
      resultado = { ok: false, codigo: null, resposta: err.name === 'AbortError' ? `sem resposta em ${TIMEOUT_MS / 1000}s` : err.message }
    }

    const tentativas = e.tentativas + 1
    const historico = [...e.historico, { em: agoraIso(), codigo: resultado.codigo, resposta: resultado.resposta }].slice(-10)
    if (resultado.ok) return repo.atualizar('entregas', e.id, { status: 'entregue', tentativas, historico, entregue_em: agoraIso(), proxima_em: null })
    const espera = ESPERAS_S[tentativas - 1]
    if (log) console.warn(`[webhook] ${w.url} → ${resultado.codigo ?? resultado.resposta} (tentativa ${tentativas})`)
    return repo.atualizar('entregas', e.id, espera === undefined
      ? { status: 'falhou', tentativas, historico, proxima_em: null }
      : { status: 'pendente', tentativas, historico, proxima_em: new Date(agora().getTime() + espera * 1000).toISOString() })
  }

  async function processar() {
    if (processando) return 0
    processando = true
    try {
      const vencidas = repo.listar('entregas', e => e.status === 'pendente' && e.proxima_em <= agoraIso())
      for (const e of vencidas) await entregar(e)
      return vencidas.length
    } finally { processando = false }
  }

  function iniciar(intervaloMs = 5000) {
    parar()
    timer = setInterval(() => processar().catch(err => console.error('[webhook]', err)), intervaloMs)
    timer.unref?.()
  }
  function parar() { if (timer) clearInterval(timer); timer = null }

  function listarEntregas(orgId, { webhookId, limite = 50 } = {}) {
    return repo.listar('entregas', e => e.organizacao_id === orgId && (!webhookId || e.webhook_id === webhookId))
      .sort((a, b) => b.criada_em.localeCompare(a.criada_em)).slice(0, limite)
  }

  function reenviar(orgId, entregaId) {
    const e = repo.obter('entregas', entregaId)
    if (!e || e.organizacao_id !== orgId) throw new ErroNegocio(404, 'Entrega não encontrada.')
    return repo.atualizar('entregas', e.id, { status: 'pendente', tentativas: 0, proxima_em: agoraIso() })
  }

  function falhando() {
    return repo.listar('entregas', e => e.status === 'falhou' || (e.status === 'pendente' && e.tentativas > 0))
  }

  return { validarUrl, criar, atualizar, remover, listar, segredo, emitir, entregar, processar, iniciar, parar, listarEntregas, reenviar, falhando }
}

function validarEventos(eventos) {
  const evs = [...new Set(Array.isArray(eventos) ? eventos : [])]
  if (!evs.length) throw new ErroNegocio(400, 'Escolha ao menos um evento.')
  const ruins = evs.filter(e => !EVENTOS_WEBHOOK[e])
  if (ruins.length) throw new ErroNegocio(400, `Evento desconhecido: ${ruins.join(', ')}.`)
  return evs
}

function publico(w, comSegredo = false) {
  return { id: w.id, url: w.url, eventos: w.eventos, descricao: w.descricao, ativo: w.ativo, criado_em: w.criado_em, ...(comSegredo ? { segredo: w.segredo } : {}) }
}
