#!/usr/bin/env node
// Backup do Supabase para fora dele: a tabela `registros` inteira (um
// arquivo por rodada) e o bucket `arquivos` (espelho incremental: arquivo
// que já está na pasta não desce de novo; os nomes nunca mudam de conteúdo).
//
//   node ferramentas/backup.mjs [pasta]                  → pasta ou BACKUP_DIR ou ./backup
//   node ferramentas/backup.mjs --restaurar <registros.json> [pasta/arquivos]
//
// Precisa de SUPABASE_URL e SUPABASE_KEY (service_role) no ambiente. Rode
// todo dia (Agendador de Tarefas, cron) e copie a pasta para outro lugar:
// a prova de cada contrato é o que o produto vende. Ver docs/OPERACAO.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAGINA = 1000

export function clienteSupabase({ url, chave, fetchFn = globalThis.fetch }) {
  const base = String(url).replace(/\/$/, '')
  const cab = { apikey: chave, authorization: `Bearer ${chave}` }
  async function chamar(caminho, { metodo = 'GET', corpo, extra = {}, bruto = false } = {}) {
    const r = await fetchFn(`${base}${caminho}`, { method: metodo, headers: { ...cab, ...(corpo !== undefined && !bruto ? { 'content-type': 'application/json' } : {}), ...extra }, body: corpo === undefined ? undefined : bruto ? corpo : JSON.stringify(corpo) })
    if (!r.ok) throw new Error(`Supabase ${metodo} ${caminho}: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
    return r
  }
  return {
    async *registros() {
      for (let de = 0; ; de += PAGINA) {
        const r = await chamar('/rest/v1/registros?select=colecao,id,dados,atualizado_em&order=colecao.asc,id.asc', { extra: { range: `${de}-${de + PAGINA - 1}`, 'range-unit': 'items' } })
        const linhas = await r.json()
        yield* linhas
        if (linhas.length < PAGINA) return
      }
    },
    async *arquivos() {
      for (let offset = 0; ; offset += PAGINA) {
        const r = await chamar('/storage/v1/object/list/arquivos', { metodo: 'POST', corpo: { prefix: '', limit: PAGINA, offset, sortBy: { column: 'name', order: 'asc' } } })
        const itens = (await r.json()).filter(o => o.id) // pastas vêm sem id
        yield* itens
        if (itens.length < PAGINA) return
      }
    },
    async baixar(nome) { return Buffer.from(await (await chamar(`/storage/v1/object/arquivos/${encodeURIComponent(nome)}`)).arrayBuffer()) },
    async gravarRegistros(lote) { await chamar('/rest/v1/registros', { metodo: 'POST', corpo: lote, extra: { prefer: 'resolution=merge-duplicates,return=minimal' } }) },
    async subir(nome, buffer) {
      try { await chamar(`/storage/v1/object/arquivos/${encodeURIComponent(nome)}`, { metodo: 'POST', corpo: buffer, bruto: true, extra: { 'content-type': tipoDe(nome), 'x-upsert': 'false' } }); return 'subiu' }
      catch (e) { if (/400.*(exists|Duplicate)/i.test(e.message)) return 'já existia'; throw e }
    },
  }
}

export async function fazerBackup({ url, chave, pasta, fetchFn, log = console, agora = () => new Date() }) {
  const cli = clienteSupabase({ url, chave, fetchFn })
  mkdirSync(join(pasta, 'arquivos'), { recursive: true })
  const registros = []
  for await (const l of cli.registros()) registros.push(l)
  const carimbo = agora().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const arqRegistros = join(pasta, `registros-${carimbo}.json`)
  writeFileSync(`${arqRegistros}.tmp`, JSON.stringify(registros))
  renameSync(`${arqRegistros}.tmp`, arqRegistros)
  let baixados = 0, pulados = 0
  for await (const o of cli.arquivos()) {
    const destino = join(pasta, 'arquivos', o.name)
    if (existsSync(destino) && statSync(destino).size > 0) { pulados++; continue }
    writeFileSync(destino, await cli.baixar(o.name))
    baixados++
  }
  const resumo = { registros: registros.length, arquivo_registros: arqRegistros, arquivos_baixados: baixados, arquivos_ja_locais: pulados }
  log.log?.(`[backup] ${registros.length} registros → ${arqRegistros}; arquivos: ${baixados} baixados, ${pulados} já estavam`)
  return resumo
}

export async function restaurar({ url, chave, arquivoRegistros, pastaArquivos, fetchFn, log = console }) {
  const cli = clienteSupabase({ url, chave, fetchFn })
  const registros = JSON.parse(readFileSync(arquivoRegistros, 'utf8'))
  for (let i = 0; i < registros.length; i += 200) await cli.gravarRegistros(registros.slice(i, i + 200).map(({ colecao, id, dados }) => ({ colecao, id, dados })))
  let subidos = 0, existiam = 0
  if (pastaArquivos && existsSync(pastaArquivos)) {
    for (const nome of readdirSync(pastaArquivos)) {
      const r = await cli.subir(nome, readFileSync(join(pastaArquivos, nome)))
      if (r === 'subiu') subidos++; else existiam++
    }
  }
  const resumo = { registros: registros.length, arquivos_subidos: subidos, arquivos_ja_existiam: existiam }
  log.log?.(`[restaurar] ${registros.length} registros gravados; arquivos: ${subidos} subidos, ${existiam} já existiam`)
  return resumo
}

function tipoDe(nome) {
  return /\.pdf$/i.test(nome) ? 'application/pdf' : /\.tsr$/i.test(nome) ? 'application/timestamp-reply' : /\.png$/i.test(nome) ? 'image/png' : /\.jpe?g$/i.test(nome) ? 'image/jpeg' : /\.webp$/i.test(nome) ? 'image/webp' : /\.svg$/i.test(nome) ? 'image/svg+xml' : 'application/octet-stream'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { SUPABASE_URL: url, SUPABASE_KEY: chave } = process.env
  if (!url || !chave) { console.error('Defina SUPABASE_URL e SUPABASE_KEY (service_role).'); process.exit(2) }
  const args = process.argv.slice(2)
  try {
    if (args[0] === '--restaurar') {
      if (!args[1]) { console.error('uso: backup.mjs --restaurar <registros.json> [pasta/arquivos]'); process.exit(2) }
      await restaurar({ url, chave, arquivoRegistros: args[1], pastaArquivos: args[2] })
    } else {
      await fazerBackup({ url, chave, pasta: args[0] || process.env.BACKUP_DIR || join(process.cwd(), 'backup') })
    }
  } catch (e) { console.error(`[backup] falhou: ${e.message}`); process.exit(1) }
}
