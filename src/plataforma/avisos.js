// Avisos à organização por e-mail: o que acontece com um contrato depois de
// enviado chega a quem emitiu e a quem administra, sem precisar entrar no
// painel. Entra pelo mesmo gancho `aoEvento` dos webhooks: o serviço de
// assinatura e a agenda emitem, e este módulo escolhe quem avisar e escreve.
//
// Quem recebe: quem enviou o contrato pelo painel (`enviado_por`) e os
// administradores ativos da organização. Enviado pela API (sem pessoa), vão
// os emissores ativos também. Sem repetição, e o leitor nunca recebe.
//
// Uma pessoa que assina quando ainda faltam outras gera "assinou"; a última
// gera só "assinado por todos" (os dois chegariam juntos).

const PAPEL = { parte: 'parte', representante: 'representante legal', testemunha: 'testemunha', interveniente: 'interveniente' }

export function criarAvisos({ repo, notificar, config = {}, log = console }) {
  const baseUrl = (config.baseUrl || 'http://localhost:3000').replace(/\/$/, '')
  const emAndamento = new Set()

  const painel = (c) => `${baseUrl}/painel/contratos/${c.id}`
  const ref = (c) => (c.referencia ? ` (ref. ${c.referencia})` : '')
  const primeiro = (nome) => String(nome || '').split(' ')[0]
  const dataHora = (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—')
  const lista = (pessoas) => pessoas.map(p => p.nome).join(', ')
  const pendentes = (c) => repo.listar('signatarios', s => s.contrato_id === c.id && !['assinado', 'recusado'].includes(s.status)).sort((a, b) => a.ordem - b.ordem)

  function destinatarios(c) {
    const pessoas = repo.listar('usuarios', u => u.organizacao_id === c.organizacao_id && u.ativo && u.email)
    const porEmail = new Map()
    const incluir = (u) => porEmail.set(u.email.toLowerCase(), u)
    const enviou = c.enviado_por?.usuario_id ? pessoas.find(u => u.id === c.enviado_por.usuario_id) : null
    if (enviou) incluir(enviou)
    pessoas.filter(u => u.papel === 'org_admin').forEach(incluir)
    if (!enviou) pessoas.filter(u => u.papel === 'emissor').forEach(incluir)
    return [...porEmail.values()]
  }

  // Cada tipo devolve { assunto, texto } ou null (nada a dizer).
  const MENSAGENS = {
    'signatario.assinou'(c, d) {
      const faltam = d.faltam?.length ? d.faltam : pendentes(c)
      if (!faltam.length) return null // "assinado por todos" vem em seguida
      const s = d.signatario || {}
      return {
        assunto: `${primeiro(s.nome)} assinou: ${c.titulo}`,
        texto: `${s.nome}${s.papel ? ` (${PAPEL[s.papel] || s.papel})` : ''} assinou o "${c.titulo}"${ref(c)}${d.via_lote ? ', pelo lote' : ''}.\n\nFalta${faltam.length > 1 ? 'm' : ''}: ${lista(faltam)}.\n\nAcompanhe no painel:\n${painel(c)}`,
      }
    },
    'contrato.assinado'(c, d) {
      return {
        assunto: `Assinado por todos: ${c.titulo}`,
        texto: `Todas as partes assinaram o "${c.titulo}"${ref(c)}${d.signatarios?.length ? `: ${lista(d.signatarios)}` : ''}.\n\nCódigo de verificação: ${c.codigo_verificacao || '—'}${d.verificacao_url ? `\nSelo público: ${d.verificacao_url}` : ''}\n\nO PDF assinado e o dossiê de provas estão no painel:\n${painel(c)}`,
      }
    },
    'contrato.recusado'(c, d) {
      const s = d.signatario || {}
      return {
        assunto: `Recusado por ${primeiro(s.nome)}: ${c.titulo}`,
        texto: `${s.nome} recusou o "${c.titulo}"${ref(c)}.\n\nMotivo informado: "${d.motivo || '—'}"\n\nEste contrato não pode mais ser assinado. Se fizer sentido, ajuste as condições e gere outro:\n${painel(c)}`,
      }
    },
    'contrato.expirado'(c, d) {
      const faltam = d.faltam?.length ? d.faltam : pendentes(c)
      return {
        assunto: `Prazo terminou sem assinatura: ${c.titulo}`,
        texto: `O prazo para assinar o "${c.titulo}"${ref(c)} terminou em ${dataHora(c.expira_em)}${faltam.length ? ` e ${lista(faltam)} não assin${faltam.length > 1 ? 'aram' : 'ou'}` : ''}.\n\nPara tentar de novo, gere outro contrato pelo painel:\n${painel(c)}`,
      }
    },
    'contrato.expirando'(c, d) {
      const faltam = d.faltam?.length ? d.faltam : pendentes(c)
      const lembrados = d.lembrados?.length ? ` Enviamos um lembrete com link novo para ${lista(d.lembrados)}.` : ''
      return {
        assunto: `Expira amanhã: ${c.titulo}`,
        texto: `O prazo para assinar o "${c.titulo}"${ref(c)} termina em ${dataHora(c.expira_em)} e ainda falta${faltam.length > 1 ? 'm' : ''} ${lista(faltam)}.${lembrados}\n\nSe precisar de mais tempo, cancele este e gere outro com prazo maior:\n${painel(c)}`,
      }
    },
  }

  async function enviar(orgId, tipo, dados) {
    const id = dados?.contrato?.id
    const c = id ? repo.obter('contratos', id) : null
    if (!c || c.organizacao_id !== orgId || !MENSAGENS[tipo]) return 0
    const m = MENSAGENS[tipo](c, dados || {})
    if (!m) return 0
    let n = 0
    for (const u of destinatarios(c)) {
      await notificar({ para: u.email, canal: 'email', assunto: m.assunto, texto: `Olá, ${primeiro(u.nome)}.\n\n${m.texto}`, meta: { tipo: `aviso.${tipo}`, contrato_id: c.id, usuario_id: u.id } })
      n++
    }
    return n
  }

  // Assinatura e agenda chamam sem esperar: falha aqui nunca derruba nada.
  function aoEvento(orgId, tipo, dados) {
    const p = enviar(orgId, tipo, dados).catch(e => log.error?.('[avisos]', e.message))
    emAndamento.add(p)
    p.finally(() => emAndamento.delete(p))
  }

  return { aoEvento, enviar, destinatarios, aguardar: () => Promise.allSettled([...emAndamento]), TIPOS: Object.keys(MENSAGENS) }
}
