// Exportação completa da organização: um zip com todos os contratos (cada
// um como pacote de prova), índice em CSV, pessoas, dados da conta e
// auditoria. Só administrador, developer (suporte) ou a API baixam.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { csv } from '../src/plataforma/exportacao.js'
import { SENHA, assinarPeloLink, subirServidor } from './apoio-http.js'

let A, admin, leitor
const exemplo = (n) => JSON.parse(readFileSync(`exemplos/${n}.json`, 'utf8'))

function entradasDoZip(buf) {
  const entradas = []
  for (let i = 0; i + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(i) !== 0x02014b50) continue
    const n = buf.readUInt16LE(i + 28), e = buf.readUInt16LE(i + 30), c = buf.readUInt16LE(i + 32)
    entradas.push({ nome: buf.toString('utf8', i + 46, i + 46 + n), metodo: buf.readUInt16LE(i + 10), comprimido: buf.readUInt32LE(i + 20), local: buf.readUInt32LE(i + 42) })
    i += 45 + n + e + c
  }
  return entradas
}
function lerEntrada(buf, nome) {
  const ent = entradasDoZip(buf).find(x => x.nome === nome)
  assert.ok(ent, `entrada ${nome} no zip`)
  const h = ent.local
  const inicio = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28)
  const dados = buf.subarray(inicio, inicio + ent.comprimido)
  return ent.metodo === 8 ? inflateRawSync(dados) : dados
}

before(async () => {
  A = await subirServidor()
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Maria Admin Souza', email: 'admin@org1.exemplo', papel: 'org_admin', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ organizacaoId: 'org1', nome: 'Leo Leitor', email: 'leitor@org1.exemplo', papel: 'leitor', senha: SENHA })
  A.plataforma.criarUsuarioDireto({ nome: 'Dev', email: 'dev@plataforma.exemplo', papel: 'developer', senha: SENHA })
  admin = await A.entrar('admin@org1.exemplo')
  leitor = await A.entrar('leitor@org1.exemplo')
  const { modelo, dados } = exemplo('pf-determinado')
  const { corpo: c1 } = await A.json(await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo, dados, referencia: 'EXP-1' } }))
  await A.api(`/v1/contratos/${c1.id}/enviar`, { metodo: 'POST', corpo: { signatarios: [{ nome: 'João da Silva Exemplo', email: 'joao@exemplo.com' }] } })
  await assinarPeloLink(A, 'joao@exemplo.com', 'João da Silva Exemplo')
  const pj = exemplo('pj-indeterminado')
  await A.api('/v1/contratos', { metodo: 'POST', corpo: { modelo: pj.modelo, dados: pj.dados, referencia: 'EXP-2' } })
})
after(() => A.fechar())

test('csv: separador ;, BOM e aspas quando precisa', () => {
  const t = csv([['a', 'b'], ['x;y', 'diz "oi"\nlinha']])
  assert.ok(t.startsWith('﻿'))
  assert.equal(t, '﻿a;b\r\n"x;y";"diz ""oi""\nlinha"\r\n')
})

test('a API exporta tudo: índice, uma pasta por contrato com o pacote de prova, pessoas, organização e auditoria', async () => {
  const r = await A.api('/v1/exportar')
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'application/zip')
  assert.match(r.headers.get('content-disposition'), /exportacao-exemplo-servicos-medicos-ltda-\d{4}-\d{2}-\d{2}\.zip/)
  const zip = Buffer.from(await r.arrayBuffer())
  const nomes = entradasDoZip(zip).map(e => e.nome)
  for (const n of ['LEIA-ME.txt', 'indice.csv', 'pessoas.csv', 'organizacao.json', 'auditoria.json']) assert.ok(nomes.includes(n), n)
  const pastas = [...new Set(nomes.filter(n => n.startsWith('contratos/')).map(n => n.split('/').slice(0, 3).join('/')))]
  assert.equal(pastas.length, 2, 'uma pasta por contrato')
  const assinada = pastas.find(p => nomes.includes(`${p}/contrato-assinado.pdf`))
  assert.ok(assinada, 'o assinado tem a via final')
  for (const n of ['LEIA-ME.txt', 'contrato-original.pdf', 'dossie.pdf', 'dossie.json']) assert.ok(nomes.includes(`${assinada}/${n}`), n)
  const outra = pastas.find(p => p !== assinada)
  assert.ok(!nomes.includes(`${outra}/contrato-assinado.pdf`), 'o só gerado não tem via final')

  const indice = lerEntrada(zip, 'indice.csv').toString('utf8')
  const linhas = indice.replace(/^﻿/, '').trim().split('\r\n')
  assert.equal(linhas.length, 3)
  assert.match(linhas[0], /^id;referencia;titulo;modelo;situacao/)
  const assinadaLinha = linhas.find(l => l.includes('EXP-1'))
  assert.match(assinadaLinha, /;assinado;/)
  assert.match(assinadaLinha, /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)
  assert.ok(assinadaLinha.includes(assinada), 'a linha aponta a pasta')

  const pessoas = lerEntrada(zip, 'pessoas.csv').toString('utf8')
  assert.match(pessoas, /João da Silva Exemplo;pf;529\.982\.247-25/)
  assert.match(pessoas, /Limpeza Exemplo Ltda\.;pj;;11\.444\.777\/0001-61/)

  const conta = JSON.parse(lerEntrada(zip, 'organizacao.json').toString('utf8'))
  assert.equal(conta.organizacao.dados.razao_social, 'Exemplo Serviços Médicos Ltda.')
  assert.ok(conta.usuarios.some(u => u.email === 'admin@org1.exemplo'))
  assert.ok(!JSON.stringify(conta).includes('chave-teste'), 'nenhum segredo sai na exportação')

  const leiame = lerEntrada(zip, 'LEIA-ME.txt').toString('utf8')
  assert.match(leiame, /2 contrato\(s\)/)
  assert.match(leiame, /pela API/)
  assert.ok(A.repo.listar('auditoria', a => a.acao === 'organizacao.exportada').length === 1, 'fica na auditoria')
})

test('painel: administrador baixa, leitor não; developer baixa como suporte; filtro por data', async () => {
  assert.equal((await A.api('/painel/api/org/exportar', { chave: null, cookie: leitor })).status, 403)
  const r = await A.api('/painel/api/org/exportar?desde=2099-01-01', { chave: null, cookie: admin })
  assert.equal(r.status, 200)
  const zip = Buffer.from(await r.arrayBuffer())
  assert.equal(entradasDoZip(zip).filter(e => e.nome.startsWith('contratos/')).length, 0, 'nada criado depois de 2099')
  assert.match(lerEntrada(zip, 'LEIA-ME.txt').toString('utf8'), /por admin@org1\.exemplo/)
  const dev = await A.entrar('dev@plataforma.exemplo')
  const s = await A.api('/painel/api/org/exportar', { chave: null, cookie: dev, cabecalhos: { 'x-organizacao': 'org1' } })
  assert.equal(s.status, 200)
  assert.equal(entradasDoZip(Buffer.from(await s.arrayBuffer())).filter(e => e.nome.endsWith('/dossie.json')).length, 2)
})
