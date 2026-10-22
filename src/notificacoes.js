// Envio de mensagens (link de assinatura, código, convites, avisos).
//
// Dois transportes com a mesma função `enviar({ para, canal, assunto, texto, meta })`:
//   - transporteCaixa: só grava na coleção `caixa` (aparece em /dev). Desenvolvimento e testes.
//   - transporteResend: manda o e-mail de verdade pela API do Resend e TAMBÉM grava na
//     `caixa` (com o id do provedor, ou o erro) — é a auditoria do que saiu.
// `transporteDoAmbiente` escolhe pelo ambiente: RESEND_API_KEY + EMAIL_REMETENTE ligam o Resend.
//
// Falha no provedor lança erro: quem chamou (enviar contrato, convite) precisa saber que o
// link não chegou, em vez de fingir que foi. A cópia na caixa fica marcada com `erro`.

const RESEND_URL = 'https://api.resend.com/emails'

export function transporteCaixa(repo, { log = true } = {}) {
  return async function enviar({ para, canal = 'email', assunto, texto, meta = {} }) {
    const msg = repo.inserir('caixa', { para, canal, assunto, texto, meta, em: new Date().toISOString() })
    if (log) console.log(`[caixa] → ${para}: ${assunto}`)
    return msg
  }
}

export function transporteResend(repo, { apiKey, remetente, responderPara = null, fetchFn = globalThis.fetch, log = true } = {}) {
  if (!apiKey) throw new Error('transporteResend: falta a chave da API (RESEND_API_KEY)')
  if (!remetente || !/@/.test(remetente)) throw new Error('transporteResend: falta o remetente (EMAIL_REMETENTE, ex.: "BullaCheck <contrato@bullacheck.com.br>")')
  return async function enviar({ para, canal = 'email', assunto, texto, meta = {} }) {
    const em = new Date().toISOString()
    if (canal !== 'email') {
      // Só e-mail por enquanto: outro canal fica registrado e não sai (o serviço avisa).
      const msg = repo.inserir('caixa', { para, canal, assunto, texto, meta, em, erro: `canal "${canal}" não tem transporte` })
      throw new Error(`Não há transporte para o canal "${canal}".`)
    }
    const corpo = { from: remetente, to: [para], subject: assunto, text: texto, html: htmlDe(texto) }
    if (responderPara) corpo.reply_to = responderPara
    let resposta, detalhe = ''
    try {
      resposta = await fetchFn(RESEND_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(corpo) })
      detalhe = resposta.ok ? '' : await resposta.text().catch(() => '')
    } catch (e) {
      repo.inserir('caixa', { para, canal, assunto, texto, meta, em, erro: `rede: ${e.message}` })
      throw new Error(`E-mail para ${para} não saiu (${e.message}).`)
    }
    if (!resposta.ok) {
      const erro = `resend ${resposta.status}: ${resumoErro(detalhe)}`
      repo.inserir('caixa', { para, canal, assunto, texto, meta, em, erro })
      if (log) console.error(`[resend] ✘ ${para}: ${erro}`)
      throw new Error(`E-mail para ${para} não saiu (${erro}).`)
    }
    const { id = null } = await resposta.json().catch(() => ({}))
    const msg = repo.inserir('caixa', { para, canal, assunto, texto, meta, em, envio: { provedor: 'resend', id } })
    if (log) console.log(`[resend] → ${para}: ${assunto} (${id || 'sem id'})`)
    return msg
  }
}

// Escolhe o transporte pelo ambiente. Em produção sem Resend, só segue com
// EMAIL_TRANSPORTE=caixa explícito: um servidor público que "envia" para uma
// caixa interna parece funcionar e não funciona.
export function transporteDoAmbiente(repo, env = process.env, { producao = env.NODE_ENV === 'production', log = true } = {}) {
  if (env.RESEND_API_KEY) {
    return { nome: `Resend (${env.EMAIL_REMETENTE})`, enviar: transporteResend(repo, { apiKey: env.RESEND_API_KEY, remetente: env.EMAIL_REMETENTE, responderPara: env.EMAIL_RESPONDER_PARA || null, log }) }
  }
  if (producao && env.EMAIL_TRANSPORTE !== 'caixa') {
    throw new Error('Em produção é preciso RESEND_API_KEY e EMAIL_REMETENTE (ou EMAIL_TRANSPORTE=caixa para subir sem e-mail, de propósito).')
  }
  return { nome: 'caixa interna (/dev)', enviar: transporteCaixa(repo, { log }) }
}

// ── Texto → HTML simples ─────────────────────────────────────────────────────
// Os textos são escritos em texto puro (parágrafos separados por linha em
// branco, links soltos). O HTML só os torna legíveis e clicáveis; nada de
// template com imagem: o e-mail precisa chegar e abrir em qualquer cliente.

const escapar = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const comLinks = (s) => s.replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" style="color:#1f6aa5">${u}</a>`)

export function htmlDe(texto) {
  const paragrafos = String(texto || '').split(/\n{2,}/).map(p => `<p style="margin:0 0 16px">${comLinks(escapar(p)).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#ffffff;color:#1b2633;font:16px/1.55 -apple-system,'Segoe UI',Roboto,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 24px">${paragrafos}</div></body></html>`
}

function resumoErro(texto) {
  try { const j = JSON.parse(texto); return j.message || j.error || texto.slice(0, 200) } catch { return String(texto).slice(0, 200) }
}
