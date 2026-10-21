// Legislação local: o texto compilado das normas que as cláusulas citam,
// indexado por artigo, e o leitor de citações ("CC arts. 593 a 609; CLT art.
// 442-B") que liga a `base_legal` de uma cláusula ao artigo de verdade.
//
// Os arquivos em legislacao/*.md vêm de github.com/ctresb/leis (texto
// compilado do normas.leg.br, domínio público: Lei 9.610/1998 art. 8º, IV) e
// são baixados por `node ferramentas/legislacao.mjs atualizar`. O catálogo do
// que existe fica em legislacao/normas.json; de onde veio e quando, em
// legislacao/fontes.json (gerado).
//
// Quem usa:
//   - a bula: "o que diz a lei" embaixo de cada cláusula (assinatura, painel);
//   - o linter: artigo que não existe ou norma revogada é grave; cláusula sem
//     base legal é aviso;
//   - o editor de cláusula: mostra o artigo ao lado enquanto o revisor digita.
//
// Nada aqui é assíncrono nem toca a rede: lê os arquivos uma vez, sob demanda.

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DIR_PADRAO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legislacao')

// ── Normalização de nomes de norma ───────────────────────────────────────────

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
export function normalizarNome(s) {
  return semAcento(s).toLowerCase()
    .replace(/\bn[º°o]?\.?\s*/g, ' ')          // "nº 10.406" → "10.406"
    .replace(/(\d)\.(\d)/g, '$1$2')             // "10.406" → "10406"
    .replace(/[,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Todos os jeitos de chamar uma norma que o leitor de citações aceita.
function apelidosDe(n) {
  const base = [n.sigla, n.nome]
  const num = `${n.numero}/${n.ano}`
  const tipos = { lei: ['lei'], mp: ['mp', 'medida provisoria', 'medida provisória'], 'decreto-lei': ['decreto-lei', 'decreto lei', 'dl', 'del'] }
  for (const t of tipos[n.tipo] || [n.tipo]) base.push(`${t} ${num}`, `${t} ${n.numero}`)
  if (n.titulo) base.push(n.titulo)
  return [...new Set(base.map(normalizarNome))]
}

// ── Leitura do markdown ──────────────────────────────────────────────────────

const RE_ARTIGO = /^\*{0,2}Art\.?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:-[A-Z])?)\s*[ºo°]?\s*\.?\s*\*{0,2}\s*(.*)$/
const RE_PARAGRAFO = /^\*{0,2}§\s*(\d+)\s*[ºo°]*\s*\.?\s*\*{0,2}\s*(.*)$/
const RE_PAR_UNICO = /^\*{0,2}Par[áa]grafo\s+[úu]nico\s*\.?\s*\*{0,2}\s*(.*)$/i
const RE_INCISO = /^([IVXLC]+(?:-[A-Z])?)\s*[-–—]\s*(.*)$/
const RE_ALINEA = /^([a-z])\)\s*(.*)$/
const RE_ITEM = /^(\d+)\.\s+(.*)$/
const RE_NOTA_SO = /^\*\((.*)\)\*\s*$/
const RE_NOTA_FIM = /\s*\*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\*\s*$/
const ORDEM = { caput: 0, paragrafo: 1, inciso: 2, alinea: 3, item: 4 }
// "Art. 1.022" → "1022": o número do artigo nunca leva ponto no índice nem na citação.
const semPontos = (n) => String(n).replace(/\./g, '')

function frontmatter(texto) {
  const meta = {}
  if (!texto.startsWith('---')) return { meta, corpo: texto }
  const fim = texto.indexOf('\n---', 3)
  if (fim < 0) return { meta, corpo: texto }
  for (const linha of texto.slice(3, fim).split('\n')) {
    const m = linha.match(/^([\w_]+):\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (/^".*"$/.test(v)) v = v.slice(1, -1)
    meta[m[1]] = v === 'true' ? true : v === 'false' ? false : v
  }
  return { meta, corpo: texto.slice(fim + 4) }
}

// Tira a nota do fim da linha ("*(Redação dada pela Lei…)*") e os negritos soltos.
function limpar(texto) {
  let nota = null
  let t = String(texto || '').trim()
  const m = t.match(RE_NOTA_FIM)
  if (m) { nota = m[1].trim(); t = t.slice(0, m.index).trim() }
  t = t.replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
  return { texto: t, nota }
}

export function indexarNorma(markdown) {
  const { meta, corpo } = frontmatter(markdown)
  const artigos = new Map()
  const ordem = []
  let atual = null, linhaAtual = null

  const abrirLinha = (tipo, rotulo, texto) => {
    const { texto: t, nota } = limpar(texto)
    linhaAtual = { tipo, rotulo, texto: t, nota }
    atual.linhas.push(linhaAtual)
  }

  for (const bruta of corpo.split('\n')) {
    const linha = bruta.trim()
    if (!linha) continue
    if (linha.startsWith('#')) { atual = null; linhaAtual = null; continue }
    if (/^(Brasília|Rio de Janeiro),\s/.test(linha)) { atual = null; linhaAtual = null; continue } // fecho da lei, não é texto do último artigo

    let m
    if ((m = linha.match(RE_ARTIGO))) {
      const numero = semPontos(m[1])
      if (artigos.has(numero)) { atual = null; linhaAtual = null; continue } // repetido (anexo, tabela): fica o primeiro
      atual = { numero, linhas: [], revogado: false }
      artigos.set(numero, atual); ordem.push(numero)
      abrirLinha('caput', 'caput', m[2])
      // "Art. 5º *(Revogado pela Lei…)*" ou "Art. 374*. (Revogado…)*": só a nota, nenhum texto.
      const cap = atual.linhas[0]
      const soNota = !cap.texto && cap.nota
      if ((soNota && /revogad|vetad/i.test(cap.nota)) || /^[\s.*(]*(revogad|vetad)/i.test(cap.texto)) {
        atual.revogado = true
        if (soNota) { cap.texto = `(${cap.nota})`; cap.nota = null }
        else cap.texto = cap.texto.replace(/^[\s.*]+/, '').replace(/\*+$/, '').trim()
      }
      continue
    }
    if (!atual) continue
    if ((m = linha.match(RE_PARAGRAFO))) { abrirLinha('paragrafo', `§ ${m[1]}º`, m[2]); continue }
    if ((m = linha.match(RE_PAR_UNICO))) { abrirLinha('paragrafo', 'Parágrafo único', m[1]); continue }
    if ((m = linha.match(RE_INCISO))) { abrirLinha('inciso', m[1], m[2]); continue }
    if ((m = linha.match(RE_ALINEA))) { abrirLinha('alinea', m[1], m[2]); continue }
    if ((m = linha.match(RE_ITEM))) { abrirLinha('item', m[1], m[2]); continue }
    if ((m = linha.match(RE_NOTA_SO))) { if (linhaAtual) linhaAtual.nota = [linhaAtual.nota, m[1].trim()].filter(Boolean).join(' '); continue }
    if (/^[A-ZÇÁÉÍÓÚÂÊÔÃÕ\s–—-]{6,}$/.test(linha) && !/[a-z]/.test(linha)) { atual = null; linhaAtual = null; continue } // título sem '#'
    if (linhaAtual) { const { texto, nota } = limpar(linha); linhaAtual.texto = `${linhaAtual.texto} ${texto}`.trim(); if (nota) linhaAtual.nota = nota }
  }
  return { meta, artigos, ordem }
}

// ── Leitor de citações ───────────────────────────────────────────────────────
//
// "CC arts. 395, 406 e 597; Lei 10.192/2001 art. 2º §1º"
//   → [{ norma: 'CC', artigos: [{ de: '395' }, { de: '406' }, { de: '597' }] },
//      { norma: 'Lei 10.192/2001', artigos: [{ de: '2', dispositivos: ['§ 1º'] }] }]
// "CC arts. 593 a 609"      → faixa { de: '593', ate: '609' }
// "CPC art. 784, III e §4º" → dispositivos ['III', '§ 4º'] (caput + esses)
// "CLT art. 2º (poder diretivo)" → observação no artigo
// Texto que não é citação (depois de ponto final) vira `observacao` do trecho.

const RE_ARTS = /\barts?\.?\s+/i

export function analisarCitacao(texto) {
  const trechos = []
  for (const bruto of String(texto || '').split(';')) {
    const s = bruto.trim()
    if (!s) continue
    const m = s.match(RE_ARTS)
    if (!m) {
      const obs = s.match(/\(([^)]*)\)\s*$/)
      trechos.push({ texto: s, norma: obs ? s.slice(0, obs.index).trim() : s, artigos: [], observacao: obs ? obs[1] : null })
      continue
    }
    const trecho = { texto: s, norma: s.slice(0, m.index).replace(/[,\s]+$/, '').trim(), artigos: [], observacao: null }
    let r = s.slice(m.index + m[0].length)
    let art = null
    const novo = (de) => { art = { de, ate: null, dispositivos: [], observacao: null }; trecho.artigos.push(art) }
    while (r.length) {
      r = r.replace(/^[\s,]+/, '')
      if (!r) break
      let t
      if ((t = r.match(/^(?:e|ou)(?=\s+(?:\d|§|[IVXLC]+\b|par[áa]grafo))/i))) { r = r.slice(t[0].length); continue }
      if ((t = r.match(/^a\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:-[A-Z])?)\s*[ºo°]?(?=[\s,;.)]|$)/))) { if (art) art.ate = semPontos(t[1]); else novo(semPontos(t[1])); r = r.slice(t[0].length); continue }
      if ((t = r.match(/^((?:\d{1,3}(?:\.\d{3})+|\d+)(?:-[A-Z])?)\s*[ºo°]?(?=[\s,;.)]|$)/))) { novo(semPontos(t[1])); r = r.slice(t[0].length); continue }
      if (!art) break
      if ((t = r.match(/^§\s*(\d+)\s*[ºo°]*/))) { art.dispositivos.push(`§ ${t[1]}º`); r = r.slice(t[0].length); continue }
      if ((t = r.match(/^(?:§\s*[úu]nico|par[áa]grafo\s+[úu]nico)/i))) { art.dispositivos.push('Parágrafo único'); r = r.slice(t[0].length); continue }
      if ((t = r.match(/^([IVXLC]+(?:-[A-Z])?)(?=[\s,;.)]|$)/))) { art.dispositivos.push(t[1]); r = r.slice(t[0].length); continue }
      if ((t = r.match(/^([a-z])(?=[\s,;.)]|$)/))) { art.dispositivos.push(t[1]); r = r.slice(t[0].length); continue }
      if ((t = r.match(/^\(([^)]*)\)/))) { art.observacao = t[1].trim(); r = r.slice(t[0].length); continue }
      break
    }
    const resto = r.replace(/^[\s.,:–—-]+/, '').trim()
    if (resto) trecho.observacao = resto
    trechos.push(trecho)
  }
  return trechos
}

// ── A legislação carregada ───────────────────────────────────────────────────

export function carregarLegislacao(dir = DIR_PADRAO) {
  const catalogo = existsSync(join(dir, 'normas.json')) ? JSON.parse(readFileSync(join(dir, 'normas.json'), 'utf8')) : { normas: [] }
  const fontes = existsSync(join(dir, 'fontes.json')) ? JSON.parse(readFileSync(join(dir, 'fontes.json'), 'utf8')) : { normas: {} }
  const porApelido = new Map()
  const normas = catalogo.normas.map(n => ({ ...n, apelidos: apelidosDe(n), fonte: fontes.normas?.[n.arquivo] || null }))
  for (const n of normas) for (const a of n.apelidos) porApelido.set(a, n)
  const cache = new Map()

  function indice(n) {
    if (cache.has(n.arquivo)) return cache.get(n.arquivo)
    const caminho = join(dir, n.arquivo)
    const idx = existsSync(caminho) ? indexarNorma(readFileSync(caminho, 'utf8')) : null
    cache.set(n.arquivo, idx)
    return idx
  }

  function acharNorma(nome) {
    const k = normalizarNome(nome)
    if (porApelido.has(k)) return porApelido.get(k)
    // "Lei 13.709/2018, Lei Geral…" ou "Código Civil (Lei 10.406/2002)": tenta o começo
    for (const [a, n] of porApelido) if (k.startsWith(`${a} `) || k.startsWith(`${a}(`)) return n
    return null
  }

  const publicoNorma = (n, idx) => ({
    sigla: n.sigla, nome: n.nome, titulo: n.titulo,
    vigente: idx?.meta ? idx.meta.revogada !== true : null,
    situacao: idx?.meta?.situacao || null,
    fonte: idx?.meta?.fonte || null,
    versao_texto: idx?.meta?.versao_texto || null,
    coletado_em: idx?.meta?.baixado_em || null,
  })

  // Caput + os dispositivos pedidos (com o que está abaixo deles); sem pedido, o artigo inteiro.
  function linhasDe(artigo, dispositivos) {
    if (!dispositivos.length) return artigo.linhas
    const quer = dispositivos.map(d => d.toLowerCase().replace(/\s+/g, ''))
    const saida = []
    let abaixoDe = null
    for (const l of artigo.linhas) {
      const r = l.rotulo.toLowerCase().replace(/\s+/g, '')
      if (l.tipo === 'caput') { saida.push(l); continue }
      if (quer.includes(r)) { saida.push(l); abaixoDe = ORDEM[l.tipo]; continue }
      if (abaixoDe != null && ORDEM[l.tipo] > abaixoDe) { saida.push(l); continue }
      abaixoDe = null
    }
    return saida
  }

  function faixa(idx, de, ate) {
    const i = idx.ordem.indexOf(de), f = idx.ordem.indexOf(ate)
    if (i < 0 || f < 0 || f < i) return null
    return idx.ordem.slice(i, f + 1)
  }

  const num = (n) => `${n}${/^\d$/.test(n) ? 'º' : ''}`
  const rotuloArt = (a) => `${num(a.de)}${a.ate ? ` a ${num(a.ate)}` : ''}${a.dispositivos.length ? `, ${a.dispositivos.join(', ')}` : ''}`
  const rotuloArts = (arts) => {
    if (!arts.length) return ''
    const l = arts.map(rotuloArt)
    const lista = l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l.at(-1)}` : l[0]
    return `, ${arts.length > 1 || arts[0].ate ? 'arts.' : 'art.'} ${lista}`
  }

  // Para a bula e para o linter: cada trecho da citação com o texto da lei.
  function resolver(citacao) {
    if (!citacao) return []
    return analisarCitacao(citacao).map(t => {
      const n = acharNorma(t.norma)
      const idx = n ? indice(n) : null
      const item = {
        citacao: t.texto, norma: n ? publicoNorma(n, idx) : null, norma_citada: t.norma,
        rotulo: n ? `${n.nome}${rotuloArts(t.artigos)}` : t.texto,
        artigos: [], observacao: t.observacao, problemas: [],
      }
      if (!n) { item.problemas.push(`norma "${t.norma}" não está na legislação local`); return item }
      if (!idx) { item.problemas.push(`arquivo ${n.arquivo} não foi baixado (node ferramentas/legislacao.mjs atualizar)`); return item }
      if (idx.meta.revogada === true) item.problemas.push(`${n.titulo} consta como revogada`)
      for (const a of t.artigos) {
        const numeros = a.ate ? faixa(idx, a.de, a.ate) : [a.de]
        if (!numeros) { item.problemas.push(`faixa arts. ${a.de} a ${a.ate} não existe em ${n.sigla}`); continue }
        for (const num of numeros) {
          const art = idx.artigos.get(num)
          if (!art) { item.problemas.push(`${n.sigla} art. ${num} não existe`); item.artigos.push({ numero: num, encontrado: false, revogado: false, linhas: [], observacao: a.observacao }); continue }
          if (art.revogado) item.problemas.push(`${n.sigla} art. ${num} está revogado`)
          const disp = a.ate ? [] : a.dispositivos
          const linhas = linhasDe(art, disp)
          if (disp.length && linhas.length === 1) item.problemas.push(`${n.sigla} art. ${num}: ${disp.join(', ')} não encontrado`)
          item.artigos.push({ numero: num, encontrado: true, revogado: art.revogado, linhas: linhas.map(l => ({ tipo: l.tipo, rotulo: l.rotulo, texto: l.texto, nota: l.nota })), observacao: a.observacao })
        }
      }
      return item
    })
  }

  // O que vai para a tela: só o que a pessoa precisa para ler.
  function fundamentos(citacao) {
    return resolver(citacao).map(i => ({
      citacao: i.citacao, rotulo: i.rotulo, encontrado: !!i.norma && i.problemas.length === 0,
      norma: i.norma, artigos: i.artigos.filter(a => a.encontrado).map(({ numero, revogado, linhas, observacao }) => ({ numero, revogado, linhas, observacao })),
      observacao: i.observacao,
    }))
  }

  function artigo(sigla, numero) {
    const n = acharNorma(sigla)
    const idx = n && indice(n)
    const art = idx?.artigos.get(String(numero))
    return art ? { norma: publicoNorma(n, idx), ...art } : null
  }

  return {
    dir, normas: normas.map(n => ({ sigla: n.sigla, nome: n.nome, titulo: n.titulo, arquivo: n.arquivo, apelidos: n.apelidos, baixada: existsSync(join(dir, n.arquivo)), fonte: n.fonte })),
    acharNorma, indice: (sigla) => { const n = acharNorma(sigla); return n ? indice(n) : null },
    artigo, resolver, fundamentos, analisar: analisarCitacao,
  }
}

let padrao = null
export function legislacaoPadrao() {
  if (!padrao) padrao = carregarLegislacao()
  return padrao
}
