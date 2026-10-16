// Segredos da assinatura e máscaras da página pública.
//
// Regra: segredo que dá acesso (token do link, código OTP, sessão) NUNCA é
// guardado em claro — só o hash. Vazar o armazenamento não entrega um link
// que funciona.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export const sha256 = (s) => createHash('sha256').update(s).digest('hex')

export function novoToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: sha256(token) }
}

// OTP de 6 dígitos. O hash leva o id do signatário: o mesmo código em dois
// signatários dá hashes diferentes.
export function novoOtp(signatarioId) {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return { codigo, hash: hashOtp(signatarioId, codigo) }
}
export const hashOtp = (signatarioId, codigo) => sha256(`${signatarioId}:${String(codigo).trim()}`)

export function iguais(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

// Código de verificação impresso no contrato: 12 caracteres, alfabeto sem
// 0/O, 1/I/L — alguém vai digitar isso olhando um papel.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export function novoCodigoVerificacao() {
  const b = randomBytes(12)
  const s = [...b].map(x => ALFABETO[x % ALFABETO.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}
export const normalizarCodigo = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3')

// ── Máscaras (LGPD na página pública do selo) ───────────────────────────────
const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

export function mascararNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length <= 1) return partes[0] || ''
  const iniciais = partes.slice(1).filter(p => !PARTICULAS.has(p.toLowerCase())).map(p => `${p[0].toUpperCase()}.`)
  return [partes[0], ...iniciais].join(' ')
}

export function mascararEmail(email) {
  const [u, d] = String(email || '').split('@')
  if (!d) return ''
  return `${u[0]}${'*'.repeat(Math.max(2, Math.min(u.length - 1, 6)))}@${d}`
}

export function mascararCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '')
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''
}

// Comparação do nome digitado na assinatura com o do cadastro: sem acento,
// sem caixa, espaços colapsados. "joao da silva exemplo" = "João da Silva Exemplo".
export function normalizarNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
