// Contrato vivo (Fase 5): vigência, reajuste e alertas, calculados a partir dos
// dados do contrato e do que o MODELO declara em `vida`:
//
//   "vida": {
//     "inicio": "contrato.data_inicio",
//     "prazo": { "campo": "contrato.prazo_tipo", "determinado": "determinado" },
//     "duracao_meses": "contrato.duracao_meses",
//     "aviso_previo_dias": "contrato.aviso_previo_dias",
//     "valor": "contrato.valor",
//     "indice": "contrato.indice_reajuste",
//     "reajuste": { "a_cada_meses": 12, "quando": <regra> }
//   }
//
// Tudo aqui é função pura sobre datas 'AAAA-MM-DD' (dia civil de Brasília):
// testável sem relógio e sem armazenamento.

import { avaliar, ler } from '../motor/regras.js'
import { lerData, lerNumero } from '../motor/tipos.js'

export const DIAS_AVISO_VENCIMENTO = [30, 7]
export const DIAS_AVISO_REAJUSTE = 30

// "Hoje" no Brasil: o dia muda à meia-noite de Brasília, não à de Greenwich.
export function hojeBr(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
}

const iso = (d) => d.toISOString().slice(0, 10)
const utc = (s) => new Date(`${s}T00:00:00Z`)

export function somarDias(data, n) {
  const d = utc(data)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

// 31/01 + 1 mês = 28 (ou 29)/02: o dia é limitado ao último do mês de destino.
export function somarMeses(data, n) {
  const d = utc(data)
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d.getUTCDate(), ultimo))
  return iso(alvo)
}

export const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5)

// Dados do contrato → vigência. `null` quando o modelo não declara vida (um
// termo de confidencialidade, por exemplo, vale enquanto durar o vínculo).
export function calcularVida(modelo, dados) {
  const v = modelo.vida
  if (!v) return null
  const data = lerData(ler(dados, v.inicio))
  if (!data) return null
  const inicio = iso(data)
  const determinado = v.prazo ? ler(dados, v.prazo.campo) === v.prazo.determinado : !!v.duracao_meses
  const meses = lerNumero(ler(dados, v.duracao_meses))
  // "Vigora por 12 meses a contar de 01/11/2026" termina em 31/10/2027.
  const fim = determinado && meses ? somarDias(somarMeses(inicio, meses), -1) : null
  const valor = v.valor ? lerNumero(ler(dados, v.valor)) : null
  const reajusta = v.reajuste && avaliar(v.reajuste.quando, dados)
  return {
    inicio,
    fim,
    prazo: determinado ? 'determinado' : 'indeterminado',
    aviso_previo_dias: lerNumero(ler(dados, v.aviso_previo_dias)) ?? null,
    valor,
    indice: v.indice ? ler(dados, v.indice) || null : null,
    reajuste: reajusta ? { a_cada_meses: v.reajuste.a_cada_meses } : null,
    historico: [],
  }
}

// Próximo aniversário de reajuste a partir de `hoje` (inclusive), dentro da vigência.
export function proximoReajuste(vida, hoje) {
  if (!vida?.reajuste) return null
  for (let k = 1; k < 200; k++) {
    const d = somarMeses(vida.inicio, k * vida.reajuste.a_cada_meses)
    if (vida.fim && d > vida.fim) return null
    if (d >= hoje) return d
  }
  return null
}

// O que está devido HOJE. Cada alerta tem uma chave única (com a data a que se
// refere): a agenda guarda as chaves enviadas e nunca avisa duas vezes — e uma
// prorrogação gera chaves novas, porque o fim mudou.
export function alertasDevidos(vida, hoje) {
  if (!vida) return []
  const alertas = []
  if (vida.fim) {
    if (hoje > vida.fim) alertas.push({ tipo: 'encerrado', chave: `encerrado:${vida.fim}`, data: vida.fim })
    else {
      const faltam = diasEntre(hoje, vida.fim)
      // Só o aviso mais próximo que já venceu: quem entra com 5 dias para o
      // fim recebe o de 7, não o de 30 atrasado.
      const marco = DIAS_AVISO_VENCIMENTO.filter(d => faltam <= d).sort((a, b) => a - b)[0]
      if (marco !== undefined) alertas.push({ tipo: 'vencendo', chave: `vencendo:${vida.fim}:${marco}`, data: vida.fim, dias: faltam })
    }
  }
  const r = proximoReajuste(vida, hoje)
  if (r && diasEntre(hoje, r) <= DIAS_AVISO_REAJUSTE) alertas.push({ tipo: 'reajuste', chave: `reajuste:${r}`, data: r, dias: diasEntre(hoje, r) })
  return alertas
}

// O que o painel mostra na vigência de um contrato.
export function resumoVida(vida, hoje) {
  if (!vida) return null
  return {
    ...vida,
    proximo_reajuste: proximoReajuste(vida, hoje),
    dias_para_o_fim: vida.fim ? diasEntre(hoje, vida.fim) : null,
  }
}
