// Envio de mensagens (link de assinatura, código, aviso de conclusão).
//
// Fase 2: só o transporte de DESENVOLVIMENTO, que grava na coleção `caixa` e
// aparece em /dev. Um transporte real (e-mail via Resend, WhatsApp) implementa
// a mesma função `enviar` e entra pela configuração, sem tocar no serviço.

export function transporteCaixa(repo, { log = true } = {}) {
  return async function enviar({ para, canal = 'email', assunto, texto, meta = {} }) {
    const msg = repo.inserir('caixa', { para, canal, assunto, texto, meta, em: new Date().toISOString() })
    if (log) console.log(`[caixa] → ${para}: ${assunto}`)
    return msg
  }
}
