// Leitura da planilha do RH: CSV ou XLSX → { colunas, linhas }.
//
// O que a planilha brasileira real faz, e este arquivo absorve:
//   - Excel em pt-BR salva CSV com ";" (não ",") e em Windows-1252 (não UTF-8):
//     "João" vira "JoÃ£o" se ler como UTF-8;
//   - BOM no começo do arquivo;
//   - campos entre aspas com ";" ou quebra de linha dentro;
//   - linhas em branco no fim, colunas sem título;
//   - no XLSX, data vem como Date, número como number, e fórmula como objeto.

import ExcelJS from 'exceljs'

export const LIMITE_LINHAS = 2000

export async function lerPlanilha(buffer, nomeArquivo = '') {
  const ehXlsx = /\.xlsx$/i.test(nomeArquivo) || (buffer[0] === 0x50 && buffer[1] === 0x4b) // "PK": zip
  const bruto = ehXlsx ? await lerXlsx(buffer) : lerCsv(decodificar(buffer))
  return normalizar(bruto)
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export function decodificar(buffer) {
  let b = Buffer.from(buffer)
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3)
  const utf8 = new TextDecoder('utf-8', { fatal: true })
  try {
    return utf8.decode(b)
  } catch {
    // Não é UTF-8 válido: é o Windows-1252 do Excel brasileiro.
    return new TextDecoder('windows-1252').decode(b)
  }
}

export function detectarSeparador(texto) {
  const primeira = texto.split(/\r?\n/).find(l => l.trim()) || ''
  const contagem = [';', ',', '\t'].map(s => [s, contarFora(primeira, s)])
  contagem.sort((a, b) => b[1] - a[1])
  return contagem[0][1] > 0 ? contagem[0][0] : ';'
}

function contarFora(linha, sep) {
  let n = 0, aspas = false
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas
    else if (ch === sep && !aspas) n++
  }
  return n
}

export function lerCsv(texto) {
  const sep = detectarSeparador(texto)
  const linhas = []
  let campo = '', linha = [], aspas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"' && campo === '') aspas = true
    else if (ch === sep) { linha.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo); linhas.push(linha); linha = []; campo = ''
    } else campo += ch
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas
}

// ── XLSX ────────────────────────────────────────────────────────────────────

async function lerXlsx(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets.find(w => w.actualRowCount > 0)
  if (!ws) return []
  const linhas = []
  ws.eachRow({ includeEmpty: true }, (row) => {
    const valores = []
    for (let c = 1; c <= ws.columnCount; c++) valores.push(celula(row.getCell(c).value))
    linhas.push(valores)
  })
  return linhas
}

function celula(v) {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    // Excel guarda data como meia-noite UTC; toISOString preserva o dia.
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'object') {
    if ('result' in v) return celula(v.result)            // fórmula
    if ('text' in v) return String(v.text)                // hyperlink
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    return String(v)
  }
  return String(v)
}

// ── Comum ───────────────────────────────────────────────────────────────────

function normalizar(bruto) {
  // Guarda o número original da linha ANTES de tirar as vazias: é por ele que
  // o RH vai procurar "linha 12" no Excel.
  const linhas = bruto
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => l.some(c => String(c).trim() !== ''))
  if (!linhas.length) throw new Error('A planilha está vazia.')
  const cab = linhas[0].l.map((c, i) => String(c).trim() || `Coluna ${i + 1}`)
  // Títulos repetidos ganham sufixo, senão a segunda coluna some no objeto.
  const vistos = new Map()
  const colunas = cab.map(c => {
    const n = (vistos.get(c) || 0) + 1
    vistos.set(c, n)
    return n > 1 ? `${c} (${n})` : c
  })
  const dados = linhas.slice(1)
  if (!dados.length) throw new Error('A planilha só tem o cabeçalho; nenhuma linha de dados.')
  if (dados.length > LIMITE_LINHAS) throw new Error(`A planilha tem ${dados.length} linhas; o limite por lote é ${LIMITE_LINHAS}.`)
  return {
    colunas,
    linhas: dados.map(({ l, n }) => ({
      numero: n,
      valores: Object.fromEntries(colunas.map((c, j) => [c, String(l[j] ?? '').trim()])),
    })),
  }
}
