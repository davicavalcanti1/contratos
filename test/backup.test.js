// Backup e restauração do Supabase, contra um Supabase de mentira: a tabela
// vem paginada, o bucket é espelhado sem baixar de novo o que já está, e a
// restauração grava tudo de volta sem sobrescrever arquivo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fazerBackup, restaurar } from '../ferramentas/backup.mjs'

function supabaseFalso() {
  const linhas = new Map(), bucket = new Map(), chamadas = []
  const resposta = (status, corpo, tipo = 'application/json') => new Response(corpo == null ? null : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': tipo } })
  async function fetchFn(url, { method = 'GET', headers = {}, body } = {}) {
    const u = new URL(url)
    chamadas.push(`${method} ${u.pathname}`)
    assert.equal(headers.apikey, 'k')
    if (u.pathname === '/rest/v1/registros' && method === 'GET') {
      const todas = [...linhas.values()].sort((a, b) => a.colecao.localeCompare(b.colecao) || a.id.localeCompare(b.id))
      const [de, ate] = headers.range.split('-').map(Number)
      return resposta(200, todas.slice(de, ate + 1))
    }
    if (u.pathname === '/rest/v1/registros' && method === 'POST') { for (const l of JSON.parse(body)) linhas.set(`${l.colecao}/${l.id}`, l); return resposta(201, null) }
    if (u.pathname === '/storage/v1/object/list/arquivos') {
      const { offset, limit } = JSON.parse(body)
      const nomes = [...bucket.keys()].sort()
      return resposta(200, nomes.slice(offset, offset + limit).map(name => ({ name, id: `id-${name}` })))
    }
    const m = u.pathname.match(/^\/storage\/v1\/object\/arquivos\/(.+)$/)
    if (m) {
      const nome = decodeURIComponent(m[1])
      if (method === 'GET') return bucket.has(nome) ? resposta(200, bucket.get(nome), 'application/pdf') : resposta(404, {})
      if (method === 'POST') { if (bucket.has(nome)) return resposta(400, { message: 'The resource already exists' }); bucket.set(nome, Buffer.from(body)); return resposta(200, {}) }
    }
    return resposta(404, { message: `desconhecida ${method} ${u.pathname}` })
  }
  return { fetchFn, linhas, bucket, chamadas }
}

test('backup: registros paginados num arquivo datado; bucket espelhado só com o que falta; restauração grava tudo de volta', async () => {
  const origem = supabaseFalso()
  for (let i = 0; i < 1203; i++) origem.linhas.set(`caixa/m${String(i).padStart(4, '0')}`, { colecao: 'caixa', id: `m${String(i).padStart(4, '0')}`, dados: { n: i } })
  origem.linhas.set('contratos/c1', { colecao: 'contratos', id: 'c1', dados: { titulo: 'T' } })
  origem.bucket.set('c1-original.pdf', Buffer.from('%PDF-1.4 a'))
  origem.bucket.set('c1-final.pdf', Buffer.from('%PDF-1.4 b'))
  const pasta = mkdtempSync(join(tmpdir(), 'cs-backup-'))
  const silencio = { log() {} }
  const agora = () => new Date('2026-10-21T03:00:00Z')

  const r1 = await fazerBackup({ url: 'https://x.supabase.co', chave: 'k', pasta, fetchFn: origem.fetchFn, log: silencio, agora })
  assert.equal(r1.registros, 1204)
  assert.deepEqual([r1.arquivos_baixados, r1.arquivos_ja_locais], [2, 0])
  assert.match(r1.arquivo_registros, /registros-2026-10-21-03-00\.json$/)
  assert.equal(origem.chamadas.filter(c => c === 'GET /rest/v1/registros').length, 2, 'duas páginas')
  assert.ok(readFileSync(join(pasta, 'arquivos', 'c1-final.pdf')).equals(Buffer.from('%PDF-1.4 b')))

  origem.bucket.set('c2-original.pdf', Buffer.from('%PDF-1.4 c'))
  const r2 = await fazerBackup({ url: 'https://x.supabase.co', chave: 'k', pasta, fetchFn: origem.fetchFn, log: silencio, agora: () => new Date('2026-10-22T03:00:00Z') })
  assert.deepEqual([r2.arquivos_baixados, r2.arquivos_ja_locais], [1, 2], 'incremental')
  assert.equal(readdirSync(pasta).filter(f => f.startsWith('registros-')).length, 2, 'um snapshot por rodada')

  const destino = supabaseFalso()
  destino.bucket.set('c1-final.pdf', Buffer.from('%PDF-1.4 b'))
  const r3 = await restaurar({ url: 'https://y.supabase.co', chave: 'k', arquivoRegistros: r2.arquivo_registros, pastaArquivos: join(pasta, 'arquivos'), fetchFn: destino.fetchFn, log: silencio })
  assert.equal(r3.registros, 1204)
  assert.deepEqual([r3.arquivos_subidos, r3.arquivos_ja_existiam], [2, 1])
  assert.equal(destino.linhas.get('contratos/c1').dados.titulo, 'T')
  assert.equal(destino.linhas.size, 1204)
  assert.ok(destino.bucket.get('c2-original.pdf').equals(Buffer.from('%PDF-1.4 c')))
  assert.ok(existsSync(pasta))
  rmSync(pasta, { recursive: true, force: true })
})
