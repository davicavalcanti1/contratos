// Tipos de variável. Cada tipo sabe VALIDAR o valor cru e FORMATAR para o
// texto do contrato. Validar antes de gerar é o ponto: CPF com dígito errado
// num contrato assinado é passivo, e recusar a geração é mais barato.

const so = (v) => String(v ?? '').replace(/\D/g, '')
const vazio = (v) => v === null || v === undefined || String(v).trim() === ''

function cpfValido(v) {
  const d = so(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

function cnpjValido(v) {
  const d = so(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0)
    const r = s % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

// Data aceita 'AAAA-MM-DD' (o que vem de API/banco) ou 'DD/MM/AAAA' (o que vem
// de planilha). Devolve Date em UTC para não escorregar um dia no fuso.
function lerData(v) {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return criar(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return criar(+m[3], +m[2], +m[1])
  return null
  function criar(a, me, di) {
    const dt = new Date(Date.UTC(a, me - 1, di))
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === di ? dt : null
  }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function lerNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  // "1.500,50" (pt-BR) ou "1500.50"
  const n = /,/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : null
}

// ── Por extenso ─────────────────────────────────────────────────────────────
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n) {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100), r = n % 100
  const partes = []
  if (c) partes.push(CEN[c])
  if (r < 20) { if (r) partes.push(UNI[r]) }
  else { partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNI[r % 10] : '')) }
  return partes.join(' e ')
}

const ESCALAS = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']]

export function inteiroPorExtenso(n) {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'zero'
  const grupos = []
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000)
  if (grupos.length > ESCALAS.length) throw new Error('valor grande demais para escrever por extenso')
  const partes = []
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]
    if (!g) continue
    let t = i === 1 && g === 1 ? '' : ate999(g)
    if (i > 0) t = (t ? t + ' ' : '') + ESCALAS[i][g === 1 ? 0 : 1]
    partes.push({ t, g, i })
  }
  // Regra do "e" antes do último grupo quando ele é < 100 ou centena redonda
  // ("mil e quinhentos", "um milhão e mil"); senão, só espaço ("mil cento e vinte").
  return partes.reduce((s, p, idx) => {
    if (idx === 0) return p.t
    const usaE = idx === partes.length - 1 && (p.g < 100 || p.g % 100 === 0)
    return s + (usaE ? ' e ' : ' ') + p.t
  }, '')
}

export function reaisPorExtenso(valor) {
  const centavosTot = Math.round(Math.abs(valor) * 100)
  const reais = Math.floor(centavosTot / 100), cent = centavosTot % 100
  const partes = []
  if (reais) {
    // "um milhão de reais", "dois mil reais": "de" quando termina em milhão/bilhão redondo
    const ext = inteiroPorExtenso(reais)
    const de = reais >= 1e6 && reais % 1e6 === 0 ? ' de' : ''
    partes.push(`${ext}${de} ${reais === 1 ? 'real' : 'reais'}`)
  }
  if (cent) partes.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`)
  return partes.length ? partes.join(' e ') : 'zero real'
}

// ── Catálogo ────────────────────────────────────────────────────────────────
// validar(v, def) → null se ok, ou a mensagem do problema.
// formatar(v, def, filtro) → texto que entra no contrato.
export const TIPOS = {
  texto: {
    validar: () => null,
    formatar: (v) => String(v).trim(),
  },
  cpf: {
    validar: (v) => (cpfValido(v) ? null : 'CPF inválido'),
    formatar: (v) => so(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
  },
  cnpj: {
    validar: (v) => (cnpjValido(v) ? null : 'CNPJ inválido'),
    formatar: (v) => so(v).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'),
  },
  moeda: {
    validar: (v) => (lerNumero(v) === null ? 'valor monetário inválido' : lerNumero(v) < 0 ? 'valor negativo' : null),
    // Padrão de contrato: número E extenso. Com filtro, só um dos dois.
    formatar: (v, _d, filtro) => {
      const n = lerNumero(v)
      const num = n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      if (filtro === 'numero') return num
      if (filtro === 'extenso') return reaisPorExtenso(n)
      return `${num} (${reaisPorExtenso(n)})`
    },
  },
  numero: {
    validar: (v) => (lerNumero(v) === null ? 'número inválido' : null),
    formatar: (v, _d, filtro) => {
      const n = lerNumero(v)
      if (filtro === 'extenso') return inteiroPorExtenso(n)
      const num = n.toLocaleString('pt-BR')
      return filtro === 'com_extenso' ? `${num} (${inteiroPorExtenso(n)})` : num
    },
  },
  percentual: {
    validar: (v) => {
      const n = lerNumero(v)
      return n === null ? 'percentual inválido' : n < 0 || n > 100 ? 'percentual fora de 0–100' : null
    },
    formatar: (v) => `${lerNumero(v).toLocaleString('pt-BR')}%`,
  },
  data: {
    validar: (v) => (lerData(v) ? null : 'data inválida (use AAAA-MM-DD ou DD/MM/AAAA)'),
    formatar: (v, _d, filtro) => {
      const d = lerData(v)
      const dd = String(d.getUTCDate()).padStart(2, '0'), mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      if (filtro === 'extenso') return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
      return `${dd}/${mm}/${d.getUTCFullYear()}`
    },
  },
  email: {
    validar: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : 'e-mail inválido'),
    formatar: (v) => String(v).trim().toLowerCase(),
  },
  booleano: {
    validar: (v) => (typeof v === 'boolean' ? null : 'esperado sim/não'),
    formatar: (v) => (v ? 'sim' : 'não'),
  },
  enum: {
    validar: (v, def) => (def.opcoes?.some(o => o.valor === v) ? null : `valor fora das opções (${(def.opcoes || []).map(o => o.valor).join(', ')})`),
    // Enum aparece no texto pelo RÓTULO ("prazo determinado"), não pela chave.
    formatar: (v, def) => def.opcoes.find(o => o.valor === v)?.texto ?? String(v),
  },
  endereco: {
    validar: (v) => {
      if (typeof v === 'string') return v.trim().length >= 10 ? null : 'endereço incompleto'
      const falta = ['logradouro', 'numero', 'cidade', 'uf'].filter(k => vazio(v?.[k]))
      return falta.length ? `endereço sem ${falta.join(', ')}` : null
    },
    formatar: (v) => {
      if (typeof v === 'string') return v.trim()
      const cep = v.cep ? `, CEP ${so(v.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''
      const comp = v.complemento ? `, ${v.complemento}` : ''
      const bairro = v.bairro ? `, ${v.bairro}` : ''
      return `${v.logradouro}, nº ${v.numero}${comp}${bairro}, ${v.cidade}/${v.uf}${cep}`
    },
  },
}

export { cpfValido, cnpjValido, lerData, lerNumero, vazio }
