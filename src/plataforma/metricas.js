// Painel de leitura: como as pessoas leem e assinam. Funil de signatários
// (recebeu, abriu, confirmou o código, leu até o fim, assinou, recusou,
// expirou), tempo mediano por cláusula, dúvidas e recusas ligadas a cada
// cláusula, e a lista de recusas com o motivo. Tudo sai da trilha e dos
// signatários; nada é guardado à parte.
//
// O tempo de leitura é o informado pelo navegador (evidência auxiliar):
// serve para comparar cláusulas entre si e achar onde a bula precisa de
// outra redação, não para provar nada.

import { ORG_DEMO } from './demonstracao.js'

const EM_ASSINATURA = new Set(['enviado', 'parcialmente_assinado'])
const mediana = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const arred = (x, casas = 1) => (x == null ? null : Math.round(x * 10 ** casas) / 10 ** casas)

export function criarMetricas({ repo, agora = () => new Date() }) {
  function calcular({ organizacaoId = null, dias = 90, modelo = null } = {}) {
    const d = Math.min(Math.max(Number(dias) || 90, 1), 730)
    const desde = new Date(agora().getTime() - d * 864e5).toISOString()
    // Sem organização: todas, menos a demonstração do site (ela entra só quando pedida).
    const contratos = repo.listar('contratos', c =>
      (organizacaoId ? c.organizacao_id === organizacaoId : c.organizacao_id !== ORG_DEMO)
      && c.enviado_em && c.enviado_em >= desde && (!modelo || c.modelo?.chave === modelo))
    const ids = new Set(contratos.map(c => c.id))
    const porId = new Map(contratos.map(c => [c.id, c]))
    const sigs = repo.listar('signatarios', s => ids.has(s.contrato_id))
    const eventos = repo.listar('eventos', e => ids.has(e.contrato_id))

    // ── Funil por signatário ─────────────────────────────────────────────────
    const abriram = new Set(eventos.filter(e => e.tipo === 'link.aberto' && String(e.ator || '').startsWith('signatario:')).map(e => e.ator.slice('signatario:'.length)))
    const concluiu = (s) => ['assinado', 'recusado'].includes(s.status)
    const funil = {
      receberam: sigs.length,
      abriram: sigs.filter(s => abriram.has(s.id) || s.identificado_em).length,
      confirmaram: sigs.filter(s => s.identificado_em).length,
      leram: sigs.filter(s => s.leitura_completa_em).length,
      assinaram: sigs.filter(s => s.status === 'assinado').length,
      recusaram: sigs.filter(s => s.status === 'recusado').length,
      expiraram: sigs.filter(s => !concluiu(s) && porId.get(s.contrato_id)?.status === 'expirado').length,
      pendentes: sigs.filter(s => !concluiu(s) && EM_ASSINATURA.has(porId.get(s.contrato_id)?.status)).length,
    }
    const horas = contratos.filter(c => c.assinado_em && c.enviado_em).map(c => (new Date(c.assinado_em) - new Date(c.enviado_em)) / 3600e3)
    const minutos = sigs.filter(s => s.identificado_em && s.assinado_em).map(s => (new Date(s.assinado_em) - new Date(s.identificado_em)) / 60e3)

    // ── Por cláusula, dentro de cada modelo ──────────────────────────────────
    const clausulas = new Map()
    const chaveDe = (c, cl) => `${c.modelo?.chave}|${cl}`
    for (const c of contratos) {
      for (const cl of c.snapshot?.clausulas || []) {
        const k = chaveDe(c, cl.chave)
        if (!clausulas.has(k)) clausulas.set(k, { modelo: c.modelo?.chave || null, clausula: cl.chave, numero: cl.numero, titulo: cl.titulo, critica: !!cl.critica, resumo: cl.resumo || null, contratos: 0, ciencias: 0, tempos: [], duvidas: 0, recusas: 0 })
        const e = clausulas.get(k)
        e.contratos++
        e.resumo = cl.resumo || e.resumo
      }
    }
    for (const ev of eventos) {
      const c = porId.get(ev.contrato_id)
      if (!c) continue
      const dd = ev.dados || {}
      if (ev.tipo === 'clausula.ciencia') { const e = clausulas.get(chaveDe(c, dd.clausula)); if (e) e.ciencias++ }
      else if (ev.tipo === 'clausula.duvida') { const e = clausulas.get(chaveDe(c, dd.clausula)); if (e) e.duvidas++ }
      else if (ev.tipo === 'documento.lido_ate_o_fim') {
        for (const [k, ms] of Object.entries(dd.tempos_por_clausula_ms_informado || {})) {
          const e = clausulas.get(chaveDe(c, k))
          const n = Number(ms)
          // Até 30 min por cláusula: acima disso é aba esquecida aberta, não leitura.
          if (e && Number.isFinite(n) && n > 0 && n < 1800e3) e.tempos.push(n)
        }
      }
    }
    for (const s of sigs) {
      if (s.status !== 'recusado' || !s.recusa_clausula) continue
      const e = clausulas.get(chaveDe(porId.get(s.contrato_id), s.recusa_clausula.chave))
      if (e) e.recusas++
    }
    const lista = [...clausulas.values()]
      .map(({ tempos, ...e }) => ({ ...e, leituras: tempos.length, segundos_mediana: tempos.length ? Math.round(mediana(tempos) / 1000) : null }))
      .sort((a, b) => (b.recusas + b.duvidas) - (a.recusas + a.duvidas) || (b.segundos_mediana || 0) - (a.segundos_mediana || 0) || a.numero - b.numero)

    // ── Recusas, dúvidas, modelos ────────────────────────────────────────────
    const recusas = sigs.filter(s => s.status === 'recusado').map(s => {
      const c = porId.get(s.contrato_id)
      return { contrato_id: c.id, titulo: c.titulo, referencia: c.referencia || null, modelo: c.modelo?.chave || null, signatario: s.nome, em: s.recusado_em, motivo: s.recusa_motivo || null, clausula: s.recusa_clausula || null }
    }).sort((a, b) => String(b.em).localeCompare(String(a.em)))
    const duvidas = repo.listar('duvidas', q => ids.has(q.contrato_id))
    const modelos = new Map()
    for (const c of contratos) {
      const k = c.modelo?.chave || '?'
      if (!modelos.has(k)) modelos.set(k, { chave: k, titulo: c.titulo, contratos: 0 })
      modelos.get(k).contratos++
    }

    return {
      periodo: { dias: d, desde },
      contratos: {
        enviados: contratos.length,
        assinados: contratos.filter(c => c.assinado_em).length,
        recusados: contratos.filter(c => c.status === 'recusado').length,
        expirados: contratos.filter(c => c.status === 'expirado').length,
        em_andamento: contratos.filter(c => EM_ASSINATURA.has(c.status)).length,
        horas_ate_assinar_mediana: arred(mediana(horas)),
      },
      signatarios: { ...funil, minutos_lendo_mediana: arred(mediana(minutos)) },
      duvidas: { total: duvidas.length, sem_resposta: duvidas.filter(q => !q.resposta).length },
      clausulas: lista,
      recusas,
      modelos: [...modelos.values()].sort((a, b) => b.contratos - a.contratos),
    }
  }
  return { calcular }
}
