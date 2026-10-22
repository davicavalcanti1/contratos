// Planilha de exemplo de um modelo, para o RH começar pelo formato certo:
// uma coluna por campo que a planilha pode trazer (o que a organização não
// preenche e o que tem padrão ficam de fora), com o rótulo do campo no
// cabeçalho e uma linha fictícia tirada dos exemplos do repositório.
//
// Sai como o Excel em português espera: BOM, ponto e vírgula, CRLF.

import { TIPOS } from '../motor/tipos.js'
import { ler } from '../motor/regras.js'
import { variaveisMapeaveis } from './mapear.js'

const cap = (s) => String(s).replace(/^./, c => c.toUpperCase())
const celula = (s) => { const t = String(s ?? ''); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }

export function colunasDeExemplo(modelo) {
  return variaveisMapeaveis(modelo).filter(v => v.padrao === undefined)
}

export function planilhaDeExemplo(modelo, exemplos = []) {
  const colunas = colunasDeExemplo(modelo)
  // O exemplo mais completo do modelo, nunca o "com-erros" (ele existe para a demonstração do linter).
  const candidatos = exemplos.filter(e => e.modelo === modelo.chave && !/erro/.test(e.nome))
  const preenchidos = (e) => colunas.filter(v => ler(e.dados, v.chave) !== undefined).length
  const ex = candidatos.sort((a, b) => preenchidos(b) - preenchidos(a))[0]
  const valor = (v) => {
    const bruto = ex ? ler(ex.dados, v.chave) : undefined
    if (bruto === undefined || bruto === null) return ''
    if (v.tipo === 'endereco' && typeof bruto === 'object') return TIPOS.endereco.formatar(bruto)
    if (v.tipo === 'enum') return bruto
    return String(bruto)
  }
  const linhas = [colunas.map(v => celula(cap(v.rotulo))).join(';')]
  if (ex) linhas.push(colunas.map(v => celula(valor(v))).join(';'))
  return '\uFEFF' + linhas.join('\r\n') + '\r\n'
}
