// O repo no Supabase, contra um PostgREST + Storage de mentira: a carga
// inicial pagina, cada escrita vira um upsert na ordem, remover apaga, a
// fila tenta de novo quando a rede falha, e os arquivos sobem e descem.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { criarRepoSupabase } from '../src/armazenamento/supabase.js'

// Supabase falso: uma tabela em memória e um bucket em memória.
function supabaseFalso({ falharVezes = 0 } = {}) {
  const linhas = new Map()   // `${colecao}/${id}` → { colecao, id, dados }
  const bucket = new Map()
  const chamadas = []
  let falhas = falharVezes
  const resposta = (status, corpo, tipo = 'application/json') => new Response(corpo == null ? null : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': tipo } })

  async function fetchFn(url, { method = 'GET', headers = {}, body } = {}) {
    const u = new URL(url)
    chamadas.push({ method, caminho: u.pathname + u.search, headers })
    assert.equal(headers.apikey, 'chave-teste', 'toda chamada leva a chave')
    if (falhas > 0 && method !== 'GET') { falhas--; return resposta(503, { message: 'indisponível' }) }

    if (u.pathname === '/rest/v1/registros') {
      if (method === 'GET') {
        const todas = [...linhas.values()].sort((a, b) => a.colecao.localeCompare(b.colecao) || a.id.localeCompare(b.id))
        const [de, ate] = (headers.range || '0-999').split('-').map(Number)
        return resposta(200, todas.slice(de, ate + 1))
      }
      if (method === 'POST') {
        assert.match(headers.prefer, /merge-duplicates/)
        for (const l of JSON.parse(body)) linhas.set(`${l.colecao}/${l.id}`, { colecao: l.colecao, id: l.id, dados: l.dados })
        return resposta(201, null)
      }
      if (method === 'DELETE') {
        const c = u.searchParams.get('colecao').replace('eq.', ''), id = u.searchParams.get('id').replace('eq.', '')
        linhas.delete(`${c}/${id}`)
        return resposta(204, null)
      }
    }
    const m = u.pathname.match(/^\/storage\/v1\/object\/arquivos\/(.+)$/)
    if (m) {
      const nome = decodeURIComponent(m[1])
      if (method === 'POST') {
        if (bucket.has(nome)) return resposta(400, { message: 'The resource already exists' })
        bucket.set(nome, Buffer.from(body))
        return resposta(200, { Key: nome })
      }
      if (method === 'GET') return bucket.has(nome) ? resposta(200, bucket.get(nome), 'application/pdf') : resposta(404, { message: 'not found' })
    }
    return resposta(404, { message: `rota falsa desconhecida: ${method} ${u.pathname}` })
  }
  return { fetchFn, linhas, bucket, chamadas, recuperar: () => { falhas = 0 } }
}

const opcoes = (falso, extra = {}) => ({ url: 'https://x.supabase.co/', chave: 'chave-teste', fetchFn: falso.fetchFn, log: { warn() {}, error() {} }, espera: async () => {}, ...extra })

test('carrega o que já existe, paginando, e escreve em ordem: inserir, atualizar e remover', async () => {
  const falso = supabaseFalso()
  // 1500 registros para forçar duas páginas.
  for (let i = 0; i < 1500; i++) falso.linhas.set(`caixa/m${String(i).padStart(4, '0')}`, { colecao: 'caixa', id: `m${String(i).padStart(4, '0')}`, dados: { id: `m${String(i).padStart(4, '0')}`, n: i } })
  falso.linhas.set('organizacoes/org1', { colecao: 'organizacoes', id: 'org1', dados: { id: 'org1', status: 'ativa' } })

  const repo = await criarRepoSupabase(opcoes(falso))
  assert.equal(falso.chamadas.filter(c => c.method === 'GET').length, 2, 'duas páginas')
  assert.equal(repo.listar('caixa').length, 1500)
  assert.equal(repo.obter('organizacoes', 'org1').status, 'ativa')

  const c = repo.inserir('contratos', { titulo: 'T' })
  repo.atualizar('contratos', c.id, { status: 'enviado' })
  repo.atualizar('organizacoes', 'org1', { status: 'suspensa' })
  repo.remover('caixa', 'm0001')
  assert.equal(repo.obter('contratos', c.id).status, 'enviado', 'a memória responde na hora')
  assert.ok(repo.pendentes > 0)
  await repo.aguardar()
  assert.equal(repo.pendentes, 0)
  assert.equal(falso.linhas.get(`contratos/${c.id}`).dados.status, 'enviado')
  assert.equal(falso.linhas.get('organizacoes/org1').dados.status, 'suspensa')
  assert.equal(falso.linhas.has('caixa/m0001'), false)
  const escritas = falso.chamadas.filter(x => x.method !== 'GET').map(x => x.method)
  assert.deepEqual(escritas, ['POST', 'POST', 'POST', 'DELETE'], 'na ordem em que aconteceram')

  // O que subiu volta igual numa nova instância.
  const repo2 = await criarRepoSupabase(opcoes(falso))
  assert.equal(repo2.obter('contratos', c.id).titulo, 'T')
  assert.equal(repo2.listar('caixa').length, 1499)
})

test('eventos e auditoria continuam append-only; id duplicado é recusado', async () => {
  const repo = await criarRepoSupabase(opcoes(supabaseFalso()))
  const e = repo.inserir('eventos', { tipo: 'x' })
  assert.throws(() => repo.atualizar('eventos', e.id, { tipo: 'y' }), /append-only/)
  assert.throws(() => repo.remover('auditoria', 'qualquer'), /append-only/)
  repo.inserir('contratos', { id: 'c1' })
  assert.throws(() => repo.inserir('contratos', { id: 'c1' }), /duplicado/)
  await repo.aguardar()
})

test('rede falhando: a escrita é tentada de novo e chega; se falhar sempre, fica registrada em falhas', async () => {
  const falso = supabaseFalso({ falharVezes: 2 })
  const repo = await criarRepoSupabase(opcoes(falso))
  repo.inserir('contratos', { id: 'c1', titulo: 'T' })
  await repo.aguardar()
  assert.equal(falso.linhas.get('contratos/c1').dados.titulo, 'T')
  assert.deepEqual(repo.falhas, [])

  const teimoso = supabaseFalso({ falharVezes: 99 })
  const repo2 = await criarRepoSupabase(opcoes(teimoso))
  repo2.inserir('contratos', { id: 'c2' })
  await repo2.aguardar()
  assert.equal(repo2.falhas.length, 1)
  assert.match(repo2.falhas[0].descricao, /contratos\/c2/)
  assert.equal(repo2.obter('contratos', 'c2').id, 'c2', 'a memória segue servindo')
  // Quando a rede volta, o que falhou é reenfileirado e chega.
  teimoso.recuperar()
  assert.equal(repo2.reenfileirarFalhas(), 1)
  await repo2.aguardar()
  assert.deepEqual(repo2.falhas, [])
  assert.equal(teimoso.linhas.get('contratos/c2').dados.id, 'c2')
})

test('arquivos: sobem para o bucket, não se sobrescrevem, e descem numa nova instância', async () => {
  const falso = supabaseFalso()
  const repo = await criarRepoSupabase(opcoes(falso))
  const pdf = Buffer.from('%PDF-1.4 teste')
  repo.salvarArquivo('c1-original.pdf', pdf)
  assert.throws(() => repo.salvarArquivo('c1-original.pdf', Buffer.from('outro')), /não é sobrescrito/)
  assert.ok((await repo.lerArquivo('c1-original.pdf')).equals(pdf), 'lê da cache antes de subir')
  await repo.aguardar()
  assert.ok(falso.bucket.get('c1-original.pdf').equals(pdf))
  const subida = falso.chamadas.find(c => c.caminho.startsWith('/storage/v1/object/arquivos/') && c.method === 'POST')
  assert.equal(subida.headers['content-type'], 'application/pdf')
  assert.equal(subida.headers['x-upsert'], 'false')

  const repo2 = await criarRepoSupabase(opcoes(falso))
  assert.ok((await repo2.lerArquivo('c1-original.pdf')).equals(pdf), 'desce do Storage')
  assert.equal(await repo2.lerArquivo('nao-existe.pdf'), null)
})

test('diário em disco: escrita que não chegou sobrevive à queda do processo e é refeita na subida seguinte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-diario-'))
  const bom = supabaseFalso()
  const repo0 = await criarRepoSupabase(opcoes(bom, { diario: dir }))
  repo0.inserir('contratos', { id: 'c0', titulo: 'Chegou' })
  await repo0.aguardar()
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'fila-supabase.json'), 'utf8')), [], 'escrita confirmada sai do diário')

  const teimoso = supabaseFalso({ falharVezes: 99 })
  const repo = await criarRepoSupabase(opcoes(teimoso, { diario: dir }))
  repo.inserir('contratos', { id: 'c9', titulo: 'Perdido?' })
  repo.salvarArquivo('c9-original.pdf', Buffer.from('%PDF-1.4 c9'))
  await repo.aguardar()
  assert.equal(repo.falhas.length, 2)
  assert.equal(repo.noDiario, 2)
  const diario = JSON.parse(readFileSync(join(dir, 'fila-supabase.json'), 'utf8'))
  assert.deepEqual(diario.map(d => d.tipo), ['gravar', 'arquivo'])
  assert.ok(existsSync(join(dir, 'pendentes', 'c9-original.pdf')), 'o arquivo espera em disco, não só na memória')

  // "Queda": nova instância, mesmo diário, rede de volta.
  const repo2 = await criarRepoSupabase(opcoes(bom, { diario: dir }))
  assert.equal(repo2.recuperadas, 2)
  assert.equal(repo2.obter('contratos', 'c9').titulo, 'Perdido?', 'a memória já sobe com o que estava no diário')
  await repo2.aguardar()
  assert.equal(bom.linhas.get('contratos/c9').dados.titulo, 'Perdido?')
  assert.ok(bom.bucket.get('c9-original.pdf').equals(Buffer.from('%PDF-1.4 c9')))
  assert.equal(repo2.noDiario, 0)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'fila-supabase.json'), 'utf8')), [])
  assert.ok(!existsSync(join(dir, 'pendentes', 'c9-original.pdf')), 'arquivo entregue sai da pasta de pendentes')
  rmSync(dir, { recursive: true, force: true })
})
