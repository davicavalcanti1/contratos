// Armazenamento no Supabase (Postgres via PostgREST + Storage), com a MESMA
// interface do repo em memória (repo.js).
//
// Como funciona: ao subir, todas as coleções são carregadas da tabela
// `registros` para Maps na memória, que continuam sendo a fonte em tempo de
// execução (os serviços seguem síncronos). Cada escrita vai para o Postgres
// em seguida, numa fila que respeita a ordem (write-through). Se o Supabase
// oscilar, a escrita é tentada de novo e o processo continua servindo da
// memória. Arquivos (PDFs, .tsr) vão para o bucket `arquivos`; a leitura é
// assíncrona, porque pode vir da rede.
//
// Vale para UMA instância do servidor. Com mais de uma, os Maps divergem:
// aí é hora de converter os serviços para ler do Postgres a cada pedido.
//
// Esquema: supabase/migrations/0001_registros.sql.

import { randomUUID } from 'node:crypto'

const COLECOES = ['contratos', 'signatarios', 'eventos', 'sessoes', 'caixa', 'lotes', 'planilhas', 'mapeamentos', 'organizacoes', 'usuarios', 'convites', 'chaves_api', 'webhooks', 'entregas', 'auditoria']
const SO_ANEXA = new Set(['eventos', 'auditoria'])
const PAGINA = 1000
const TENTATIVAS = 4

export async function criarRepoSupabase({ url, chave, tabela = 'registros', bucket = 'arquivos', fetchFn = globalThis.fetch, log = console, espera = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!url || !chave) throw new Error('Supabase: informe SUPABASE_URL e SUPABASE_KEY.')
  const base = String(url).replace(/\/$/, '')
  const cabecalhos = { apikey: chave, authorization: `Bearer ${chave}` }
  const dados = Object.fromEntries(COLECOES.map(c => [c, new Map()]))
  const cacheArquivos = new Map()   // nome → Buffer, só o que este processo gravou
  const falhas = []                 // escritas que não foram depois de todas as tentativas: { descricao, erro, em, op }
  let fila = Promise.resolve()
  let pendentes = 0

  async function chamar(caminho, { metodo = 'GET', corpo, extra = {}, bruto = false } = {}) {
    const r = await fetchFn(`${base}${caminho}`, {
      method: metodo,
      headers: { ...cabecalhos, ...(corpo !== undefined && !bruto ? { 'content-type': 'application/json' } : {}), ...extra },
      body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo),
    })
    if (!r.ok) {
      const texto = await r.text().catch(() => '')
      const erro = new Error(`Supabase ${metodo} ${caminho}: ${r.status} ${texto.slice(0, 300)}`)
      erro.status = r.status
      throw erro
    }
    return r
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────
  // Uma consulta paginada pela tabela inteira, em ordem estável.
  async function carregar() {
    let de = 0
    for (;;) {
      const r = await chamar(`/rest/v1/${tabela}?select=colecao,id,dados&order=colecao.asc,id.asc`, { extra: { range: `${de}-${de + PAGINA - 1}`, 'range-unit': 'items' } })
      const linhas = await r.json()
      for (const l of linhas) if (dados[l.colecao]) dados[l.colecao].set(l.id, l.dados)
      if (linhas.length < PAGINA) break
      de += PAGINA
    }
  }
  await carregar()

  // ── Fila de escrita ───────────────────────────────────────────────────────
  function enfileirar(descricao, op) {
    pendentes++
    fila = fila.then(async () => {
      for (let tentativa = 1; ; tentativa++) {
        try { await op(); return } catch (e) {
          if (tentativa >= TENTATIVAS) { falhas.push({ descricao, erro: e.message, em: new Date().toISOString(), op }); log.error?.(`[supabase] ${descricao} falhou por ora: ${e.message}. Fica para tentar de novo.`); return }
          log.warn?.(`[supabase] ${descricao} falhou (${tentativa}/${TENTATIVAS}): ${e.message}`)
          await espera(250 * 2 ** (tentativa - 1))
        }
      }
    }).finally(() => { pendentes-- })
    return fila
  }
  const gravar = (c, o) => enfileirar(`gravar ${c}/${o.id}`, () => chamar(`/rest/v1/${tabela}`, {
    metodo: 'POST', corpo: [{ colecao: c, id: o.id, dados: o, atualizado_em: new Date().toISOString() }],
    extra: { prefer: 'resolution=merge-duplicates,return=minimal' },
  }))
  const apagar = (c, id) => enfileirar(`apagar ${c}/${id}`, () => chamar(`/rest/v1/${tabela}?colecao=eq.${encodeURIComponent(c)}&id=eq.${encodeURIComponent(id)}`, { metodo: 'DELETE', extra: { prefer: 'return=minimal' } }))

  const col = (c) => {
    if (!dados[c]) throw new Error(`coleção desconhecida: ${c}`)
    return dados[c]
  }
  const copia = (o) => (o ? structuredClone(o) : null)

  return {
    inserir(c, obj) {
      const o = { id: obj.id || randomUUID(), ...obj }
      if (col(c).has(o.id)) throw new Error(`${c}: id duplicado ${o.id}`)
      col(c).set(o.id, structuredClone(o))
      gravar(c, o)
      return copia(o)
    },
    obter(c, id) {
      return copia(col(c).get(id))
    },
    atualizar(c, id, patch) {
      if (SO_ANEXA.has(c)) throw new Error(`${c} é append-only: não se altera registro`)
      const atual = col(c).get(id)
      if (!atual) throw new Error(`${c}: ${id} não existe`)
      const novo = { ...atual, ...structuredClone(patch), id }
      col(c).set(id, novo)
      gravar(c, novo)
      return copia(novo)
    },
    remover(c, id) {
      if (SO_ANEXA.has(c)) throw new Error(`${c} é append-only: não se apaga registro`)
      col(c).delete(id)
      apagar(c, id)
    },
    listar(c, filtro = () => true) {
      return [...col(c).values()].filter(filtro).map(copia)
    },

    // Arquivo gravado não é sobrescrito (o PDF original é prova): o Storage
    // recusa duplicata (x-upsert: false) e a cache deste processo também.
    salvarArquivo(nome, buffer) {
      if (cacheArquivos.has(nome)) throw new Error(`arquivo ${nome} já existe e não é sobrescrito`)
      const b = Buffer.from(buffer)
      cacheArquivos.set(nome, b)
      enfileirar(`subir arquivo ${nome}`, () => chamar(`/storage/v1/object/${bucket}/${encodeURIComponent(nome)}`, {
        metodo: 'POST', corpo: b, bruto: true, extra: { 'content-type': tipoDe(nome), 'x-upsert': 'false' },
      }).catch(e => { if (e.status === 400 && /exists|Duplicate/i.test(e.message)) return; throw e }))
      return nome
    },
    async lerArquivo(nome) {
      if (cacheArquivos.has(nome)) return cacheArquivos.get(nome)
      try {
        const r = await chamar(`/storage/v1/object/${bucket}/${encodeURIComponent(nome)}`)
        return Buffer.from(await r.arrayBuffer())
      } catch (e) {
        if (e.status === 404 || e.status === 400) return null
        throw e
      }
    },

    // Diagnóstico e desligamento limpo.
    aguardar: () => fila,
    get pendentes() { return pendentes },
    get falhas() { return falhas.map(({ op, ...f }) => f) },
    // O que falhou volta para a fila (o servidor chama de tempos em tempos).
    reenfileirarFalhas() {
      const de = falhas.splice(0)
      for (const f of de) enfileirar(f.descricao, f.op)
      return de.length
    },
    recarregar: async () => { for (const c of COLECOES) dados[c].clear(); await carregar() },
  }
}

function tipoDe(nome) {
  if (/\.pdf$/i.test(nome)) return 'application/pdf'
  if (/\.tsr$/i.test(nome)) return 'application/timestamp-reply'
  return 'application/octet-stream'
}
