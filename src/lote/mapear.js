// Mapeamento coluna da planilha → variável do modelo, e a conversão de cada
// célula para o que o motor espera.
//
// Formato do mapeamento (o mesmo que a tela edita e que fica salvo):
//   { "contratado.nome": { "coluna": "NOME COMPLETO" },
//     "contrato.forma_pagamento": { "valor": "mensal" },   ← igual para o lote todo
//     "contrato.dia_pagamento": null }                     ← não mapeada (usa o padrão)

import { createHash } from 'node:crypto'
import { avaliar, ler } from '../motor/regras.js'

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Como o RH costuma chamar cada coisa. Chave = último pedaço da variável.
const SINONIMOS = {
  nome: ['nome', 'nomecompleto', 'colaborador', 'funcionario', 'prestador', 'razaosocial', 'empresa'],
  cpf: ['cpf', 'cpfdocolaborador', 'cpftitular'],
  cnpj: ['cnpj'],
  email: ['email', 'mail', 'emailpessoal', 'emailcorporativo'],
  endereco: ['endereco', 'enderecocompleto', 'logradouro', 'residencia'],
  valor: ['valor', 'salario', 'remuneracao', 'honorarios', 'mensalidade', 'valormensal', 'valortotal'],
  data_inicio: ['inicio', 'datainicio', 'datadeinicio', 'admissao', 'dataadmissao', 'datadeadmissao'],
  tipo: ['tipo', 'tipopessoa', 'tipodepessoa', 'pfpj', 'natureza', 'tipocontratado'],
  estado_civil: ['estadocivil'],
  profissao: ['profissao', 'ocupacao'],
  nacionalidade: ['nacionalidade'],
  objeto: ['objeto', 'servico', 'servicos', 'descricao', 'atividade', 'escopo'],
  duracao_meses: ['duracao', 'meses', 'prazomeses', 'duracaomeses', 'vigenciameses'],
  representante_nome: ['representante', 'representantelegal', 'nomerepresentante', 'socio', 'responsavel'],
  representante_cpf: ['cpfrepresentante', 'cpfdorepresentante', 'cpfsocio', 'cpfresponsavel'],
  cargo: ['cargo', 'funcao'],
  matricula: ['matricula', 'registro', 'id', 'codigo'],
  setor: ['setor', 'departamento', 'area', 'lotacao'],
  foro_comarca: ['foro', 'comarca'],
  forma_pagamento: ['formapagamento', 'formadepagamento', 'pagamento'],
  prazo_tipo: ['tipoprazo', 'prazo', 'tipodeprazo'],
  dia_pagamento: ['diapagamento', 'diadopagamento', 'vencimento'],
}

export function variaveisMapeaveis(modelo) {
  return modelo.variaveis.filter(v => v.origem !== 'organizacao' && v.origem !== 'calculada')
}

export function assinaturaColunas(colunas) {
  return createHash('sha256').update([...colunas].map(norm).sort().join('|')).digest('hex').slice(0, 16)
}

// Sugestão: casa cada variável com a coluna de nome mais parecido. Cada coluna
// é usada uma vez só, das casadas com mais certeza para as com menos.
export function sugerirMapeamento(colunas, modelo) {
  const candidatos = []
  for (const v of variaveisMapeaveis(modelo)) {
    const fim = v.chave.split('.').at(-1)
    const termos = new Set([norm(fim), norm(v.rotulo), ...(SINONIMOS[fim] || [])])
    const ehRepresentante = fim.startsWith('representante')
    for (const c of colunas) {
      const nc = norm(c)
      // "CPF do representante" não é o CPF do contratado, e vice-versa.
      if (ehRepresentante !== /repres|socio|responsavel/.test(nc)) continue
      let pontos = 0
      for (const t of termos) {
        if (!t) continue
        if (nc === t) pontos = Math.max(pontos, 3)
        else if (t.length >= 4 && (nc.includes(t) || t.includes(nc) && nc.length >= 4)) pontos = Math.max(pontos, 2)
      }
      if (pontos) candidatos.push({ variavel: v.chave, coluna: c, pontos })
    }
  }
  candidatos.sort((a, b) => b.pontos - a.pontos)
  const mapa = Object.fromEntries(variaveisMapeaveis(modelo).map(v => [v.chave, null]))
  const usadas = new Set()
  for (const k of candidatos) {
    if (mapa[k.variavel] || usadas.has(k.coluna)) continue
    mapa[k.variavel] = { coluna: k.coluna }
    usadas.add(k.coluna)
  }
  return mapa
}

// ── Conversão de célula ─────────────────────────────────────────────────────

const iniciais = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean).map(p => p[0]).join('')

function converter(bruto, def) {
  const v = String(bruto ?? '').trim()
  if (v === '') return { valor: undefined }
  switch (def.tipo) {
    case 'cpf': case 'cnpj': {
      const d = v.replace(/\D/g, '')
      const tam = def.tipo === 'cpf' ? 11 : 14
      // O Excel trata CPF como número e come o zero à esquerda: 01234567890 → 1234567890.
      if (d.length < tam && d.length >= tam - 3 && /^\d+$/.test(v.replace(/[.\-/\s]/g, ''))) {
        return { valor: d.padStart(tam, '0'), aviso: `${def.rotulo}: zeros à esquerda restaurados (${v} → ${d.padStart(tam, '0')})` }
      }
      return { valor: d }
    }
    case 'moeda': case 'numero':
      return { valor: v.replace(/^R\$\s*/i, '').replace(/\s/g, '') }
    case 'percentual':
      return { valor: v.replace(/%$/, '').trim() }
    case 'email':
      return { valor: v.toLowerCase() }
    case 'booleano': {
      const n = norm(v)
      if (['sim', 's', 'x', 'true', 'verdadeiro', '1'].includes(n)) return { valor: true }
      if (['nao', 'n', 'false', 'falso', '0'].includes(n)) return { valor: false }
      return { valor: v }
    }
    case 'data': {
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/) // dd/mm/aa
      if (m) return { valor: `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/20${m[3]}` }
      const m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (m2) return { valor: `${m2[1].padStart(2, '0')}/${m2[2].padStart(2, '0')}/${m2[3]}` }
      return { valor: v }
    }
    case 'enum': {
      // Aceita a chave ("pf"), o rótulo ("Pessoa física") ou as iniciais dele ("PF").
      const n = norm(v)
      const o = def.opcoes.find(o => norm(o.valor) === n || norm(o.texto) === n || iniciais(o.texto) === n || (n.length >= 3 && norm(o.texto).startsWith(n)))
      return { valor: o ? o.valor : v }
    }
    default:
      return { valor: v.replace(/\s+/g, ' ') }
  }
}

// Linha da planilha → dados para o motor (+ avisos do que foi corrigido).
export function aplicarMapeamento(valores, mapeamento, modelo) {
  const defs = Object.fromEntries(modelo.variaveis.map(v => [v.chave, v]))
  const dados = {}
  const avisos = []
  for (const [chave, alvo] of Object.entries(mapeamento || {})) {
    if (!alvo || !defs[chave]) continue
    const bruto = 'valor' in alvo ? alvo.valor : valores[alvo.coluna]
    const { valor, aviso } = converter(bruto, defs[chave])
    if (aviso) avisos.push(aviso)
    if (valor !== undefined) definir(dados, chave, valor)
  }
  return { dados, avisos }
}

// Quem assina por esta linha. Declarado no modelo (`signatarios_da_parte`),
// porque depende dele: numa PJ quem assina é o representante, não a empresa.
export function signatariosDaLinha(modelo, dados) {
  return (modelo.signatarios_da_parte || [])
    .filter(s => avaliar(s.quando, dados))
    .map(s => ({
      papel: s.papel,
      nome: ler(dados, s.nome) || '',
      email: ler(dados, s.email) || '',
      cpf: s.cpf ? ler(dados, s.cpf) || null : null,
    }))
}

function definir(o, caminho, v) {
  const partes = caminho.split('.')
  for (const k of partes.slice(0, -1)) o = o[k] ??= {}
  o[partes.at(-1)] = v
}
