// Índices de reajuste, direto da fonte: Sistema Gerenciador de Séries do
// Banco Central (SGS). Variação mensal em %, publicada pelo IBGE (IPCA) e
// pela FGV (IGP-M) e replicada pelo BCB numa API pública e sem chave.
//
//   https://api.bcb.gov.br/dados/serie/bcdata.sgs.<serie>/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa
//
// O acumulado é composto: (1 + m1) × (1 + m2) × … − 1. Se a API cair, o painel
// aceita o percentual digitado — o reajuste não depende da integração.

import { ErroNegocio } from '../assinatura/servico.js'

export const SERIES = {
  IPCA: { serie: 433, nome: 'IPCA/IBGE' },
  'IGP-M': { serie: 189, nome: 'IGP-M/FGV' },
}

export function criarIndices({ fetchFn = globalThis.fetch, timeoutMs = 8000, tentativas = 2 } = {}) {
  const cache = new Map()

  async function mensais(indice, de, ate) {
    const s = SERIES[indice]
    if (!s) throw new ErroNegocio(400, `Índice desconhecido: ${indice}. Use ${Object.keys(SERIES).join(' ou ')}.`)
    const [ad, md] = de.split('-').map(Number), [aa, ma] = ate.split('-').map(Number)
    if (!ad || !md || !aa || !ma || aa * 12 + ma < ad * 12 + md) throw new ErroNegocio(400, 'Período inválido (use AAAA-MM, do mais antigo para o mais novo).')
    const chave = `${indice}:${de}:${ate}`
    if (cache.has(chave)) return cache.get(chave)
    const ultimoDia = new Date(Date.UTC(aa, ma, 0)).getUTCDate()
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s.serie}/dados?formato=json&dataInicial=01/${String(md).padStart(2, '0')}/${ad}&dataFinal=${ultimoDia}/${String(ma).padStart(2, '0')}/${aa}`
    // A API do BCB é intermitente (502 ou silêncio por vários segundos, e
    // na tentativa seguinte responde em menos de 1 s): duas tentativas.
    let lista, ultimoErro
    for (let tentativa = 1; tentativa <= tentativas && !lista; tentativa++) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const r = await fetchFn(url, { signal: ctrl.signal, headers: { accept: 'application/json', 'user-agent': 'contratos-saas/1 (reajuste de contratos)' } })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        lista = await r.json()
      } catch (e) {
        ultimoErro = e
      } finally { clearTimeout(t) }
    }
    if (!lista) {
      throw new ErroNegocio(503, `Não consegui consultar o ${s.nome} no Banco Central agora (${ultimoErro?.name === 'AbortError' ? 'sem resposta' : ultimoErro?.message}). Tente de novo em instantes ou informe o percentual à mão.`)
    }
    const meses = (Array.isArray(lista) ? lista : []).map(x => {
      const [, m, a] = String(x.data).split('/')
      return { mes: `${a}-${m}`, pct: Number(x.valor) }
    }).filter(x => Number.isFinite(x.pct))
    const esperados = (aa * 12 + ma) - (ad * 12 + md) + 1
    const r = { indice, nome: s.nome, de, ate, meses, completo: meses.length === esperados, esperados }
    // Só guarda em cache período completo: mês ainda não publicado vai aparecer depois.
    if (r.completo) cache.set(chave, r)
    return r
  }

  async function acumulado(indice, de, ate) {
    const r = await mensais(indice, de, ate)
    const fator = r.meses.reduce((f, m) => f * (1 + m.pct / 100), 1)
    return {
      ...r,
      acumulado_pct: Math.round((fator - 1) * 1e4) / 1e2,
      fonte: `Banco Central do Brasil, SGS série ${SERIES[indice].serie} (${SERIES[indice].nome}), variação mensal`,
      aviso: r.completo ? null : `Só ${r.meses.length} de ${r.esperados} meses estão publicados; o acumulado considera os disponíveis.`,
    }
  }

  return { acumulado }
}

// Período padrão do reajuste: os 12 meses publicados antes do aniversário
// (o índice de um mês sai no mês seguinte, então termina dois meses antes).
export function periodoPadrao(dataReajuste) {
  const [a, m] = dataReajuste.split('-').map(Number)
  const fim = new Date(Date.UTC(a, m - 1 - 2, 1))
  const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - 11, 1))
  const ym = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return { de: ym(ini), ate: ym(fim) }
}
