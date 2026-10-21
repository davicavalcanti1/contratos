// Armazenamento no Supabase (Postgres via PostgREST + Storage), com a MESMA
// interface do repo em memória (repo.js).
//
// Como funciona: ao subir, todas as coleções são carregadas da tabela
// `registros` para Maps na memória, que continuam sendo a fonte em tempo de
// execução (os serviços seguem síncronos). Cada escrita vai para o Postgres
// em seguida, numa fila que respeita a ordem (write-through). Se o Supabase
// oscilar, a escrita é tentada de novo e o processo continua servindo da
// memória. Arquivos (PDFs, .tsr, logotipos) vão para o bucket `arquivos`; a
// leitura é assíncrona, porque pode vir da rede.
//
// Diário em disco (`diario`): cada escrita que ainda não chegou ao Supabase
// fica registrada em <diario>/fila-supabase.json (e o arquivo, em
// <diario>/pendentes/) até ser confirmada. Se o processo cair com a fila
// cheia, a subida seguinte refaz tudo na mesma ordem. Sem `diario`, a fila
// vive só na memória (testes).
//
// Vale para UMA instância do servidor. Com mais de uma, os Maps divergem:
// aí é hora de converter os serviços para ler do Postgres a cada pedido.
//
// Esquema: supabase/migrations/0001_registros.sql.

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const COLECOES = ['contratos', 'signatarios', 'eventos', 'sessoes', 'caixa', 'lotes', 'planilhas', 'mapeamentos', 'organizacoes', 'usuarios', 'convites', 'chaves_api', 'webhooks', 'entregas', 'auditoria', 'clausulas', 'modelos', 'partes', 'interessados']
const SO_ANEXA = new Set(['eventos', 'auditoria'])
const PAGINA = 1000
const TENTATIVAS = 4

export async function criarRepoSupabase({ url, chave, tabela = 'registros', bucket = 'arquivos', diario = null, fetchFn = globalThis.fetch, log = console, espera = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!url || !chave) throw new Error('Supabase: informe SUPABASE_URL e SUPABASE_KEY.')
  const base = String(url).replace(/\/$/, '')
  const cabecalhos = { apikey: chave, authorization: `Bearer ${chave}` }
  const dados = Object.fromEntries(COLECOES.map(c => [c, new Map()]))
  const cacheArquivos = new Map()   // nome → Buffer, só o que este processo gravou
  const falhas = []                 // escritas que não foram depois de todas as tentativas: { descricao, erro, em, op, registro, idOp }
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

  // ── Diário em disco ───────────────────────────────────────────────────────
  const emDiario = new Map()       // id da operação → registro { tipo, colecao, id, dados | nome, descricao }
  let seqOp = 0
  const arqDiario = diario ? join(diario, 'fila-supabase.json') : null
  const dirPendentes = diario ? join(diario, 'pendentes') : null
  if (diario) mkdirSync(dirPendentes, { recursive: true })

  function salvarDiario() {
    if (!arqDiario) return
    writeFileSync(`${arqDiario}.tmp`, JSON.stringify([...emDiario.values()]))
    renameSync(`${arqDiario}.tmp`, arqDiario)
  }
  function concluirDiario(idOp, registro) {
    if (!idOp || !arqDiario) return
    emDiario.delete(idOp)
    salvarDiario()
    if (registro?.tipo === 'arquivo') { try { unlinkSync(join(dirPendentes, registro.nome)) } catch { /* já não estava lá */ } }
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
  function enfileirar(descricao, op, registro = null) {
    const idOp = registro && arqDiario ? `${Date.now()}-${++seqOp}` : null
    if (idOp) { emDiario.set(idOp, { ...registro, descricao }); salvarDiario() }
    pendentes++
    fila = fila.then(async () => {
      for (let tentativa = 1; ; tentativa++) {
        try { await op(); concluirDiario(idOp, registro); return } catch (e) {
          if (tentativa >= TENTATIVAS) {
            // Fica no diário: a próxima tentativa (ou a próxima subida) refaz.
            falhas.push({ descricao, erro: e.message, em: new Date().toISOString(), op, registro, idOp })
            log.error?.(`[supabase] ${descricao} falhou por ora: ${e.message}. Fica para tentar de novo.`)
            return
          }
          log.warn?.(`[supabase] ${descricao} falhou (${tentativa}/${TENTATIVAS}): ${e.message}`)
          await espera(250 * 2 ** (tentativa - 1))
        }
      }
    }).finally(() => { pendentes-- })
    return fila
  }
  const opGravar = (c, o) => () => chamar(`/rest/v1/${tabela}`, {
    metodo: 'POST', corpo: [{ colecao: c, id: o.id, dados: o, atualizado_em: new Date().toISOString() }],
    extra: { prefer: 'resolution=merge-duplicates,return=minimal' },
  })
  const opApagar = (c, id) => () => chamar(`/rest/v1/${tabela}?colecao=eq.${encodeURIComponent(c)}&id=eq.${encodeURIComponent(id)}`, { metodo: 'DELETE', extra: { prefer: 'return=minimal' } })
  // Arquivo gravado não é sobrescrito (o PDF original é prova): o Storage
  // recusa duplicata (x-upsert: false), e duplicata conta como entregue.
  const opSubir = (nome, b) => () => chamar(`/storage/v1/object/${bucket}/${encodeURIComponent(nome)}`, {
    metodo: 'POST', corpo: b, bruto: true, extra: { 'content-type': tipoDe(nome), 'x-upsert': 'false' },
  }).catch(e => { if (e.status === 400 && /exists|Duplicate/i.test(e.message)) return; throw e })

  const gravar = (c, o) => enfileirar(`gravar ${c}/${o.id}`, opGravar(c, o), { tipo: 'gravar', colecao: c, id: o.id, dados: o })
  const apagar = (c, id) => enfileirar(`apagar ${c}/${id}`, opApagar(c, id), { tipo: 'apagar', colecao: c, id })

  // O que ficou no diário da vez anterior volta para a fila, na mesma ordem,
  // e a memória já sobe com esses registros (o Postgres pode não os ter).
  function recuperarDiario() {
    if (!arqDiario || !existsSync(arqDiario)) return 0
    let lista = []
    try { lista = JSON.parse(readFileSync(arqDiario, 'utf8')) } catch (e) { log.error?.(`[supabase] diário ilegível, ignorado: ${e.message}`); return 0 }
    emDiario.clear()
    let n = 0
    for (const r of lista) {
      if (r.tipo === 'gravar' && dados[r.colecao]) { dados[r.colecao].set(r.id, r.dados); enfileirar(r.descricao, opGravar(r.colecao, r.dados), r); n++ }
      else if (r.tipo === 'apagar' && dados[r.colecao]) { dados[r.colecao].delete(r.id); enfileirar(r.descricao, opApagar(r.colecao, r.id), r); n++ }
      else if (r.tipo === 'arquivo') {
        const p = join(dirPendentes, r.nome)
        if (!existsSync(p)) { log.error?.(`[supabase] diário: arquivo pendente ${r.nome} não está em ${dirPendentes}; descartado`); continue }
        const b = readFileSync(p)
        cacheArquivos.set(r.nome, b)
        enfileirar(r.descricao, opSubir(r.nome, b), r)
        n++
      }
    }
    if (n) log.warn?.(`[supabase] refazendo ${n} escrita(s) que ficaram no diário`)
    else salvarDiario()
    return n
  }
  const recuperadas = recuperarDiario()

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

    salvarArquivo(nome, buffer) {
      if (cacheArquivos.has(nome)) throw new Error(`arquivo ${nome} já existe e não é sobrescrito`)
      const b = Buffer.from(buffer)
      cacheArquivos.set(nome, b)
      // O arquivo vai para o disco antes da fila: é o que o diário aponta.
      if (dirPendentes) writeFileSync(join(dirPendentes, nome), b)
      enfileirar(`subir arquivo ${nome}`, opSubir(nome, b), { tipo: 'arquivo', nome })
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
    get falhas() { return falhas.map(({ op, registro, idOp, ...f }) => f) },
    get noDiario() { return emDiario.size },
    recuperadas,
    // O que falhou volta para a fila (o servidor chama de tempos em tempos).
    reenfileirarFalhas() {
      const de = falhas.splice(0)
      for (const f of de) { if (f.idOp) emDiario.delete(f.idOp); enfileirar(f.descricao, f.op, f.registro) }
      return de.length
    },
    recarregar: async () => { for (const c of COLECOES) dados[c].clear(); await carregar() },
  }
}

function tipoDe(nome) {
  if (/\.pdf$/i.test(nome)) return 'application/pdf'
  if (/\.tsr$/i.test(nome)) return 'application/timestamp-reply'
  if (/\.png$/i.test(nome)) return 'image/png'
  if (/\.jpg$/i.test(nome)) return 'image/jpeg'
  if (/\.webp$/i.test(nome)) return 'image/webp'
  if (/\.svg$/i.test(nome)) return 'image/svg+xml'
  return 'application/octet-stream'
}
