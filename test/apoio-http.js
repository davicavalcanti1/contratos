// Monta o servidor inteiro, em memória, numa porta livre — o mesmo
// encadeamento do src/servidor/index.js, com um `fetch` falso para webhooks.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { criarRepo } from '../src/armazenamento/repo.js'
import { criarServico } from '../src/assinatura/servico.js'
import { criarBibliotecaViva } from '../src/biblioteca.js'
import { criarLotes } from '../src/lote/lotes.js'
import { transporteCaixa } from '../src/notificacoes.js'
import { criarPlataforma } from '../src/plataforma/plataforma.js'
import { criarWebhooks } from '../src/plataforma/webhooks.js'
import { criarAgenda } from '../src/vida/agenda.js'
import { criarIndices } from '../src/vida/indices.js'
import { criarApp } from '../src/servidor/app.js'

export const CHAVE = 'chave-teste'
export const SENHA = 'senha-forte-de-teste'
export const ORG = JSON.parse(readFileSync('exemplos/_organizacao.json', 'utf8'))

export async function subirServidor({ fetchWebhook, fetchIndices, agora, carimbador = null, icp = null } = {}) {
  // A baseUrl vai nos links e só existe depois do listen: o servidor sobe
  // primeiro e o app entra em seguida.
  const servidor = createServer()
  await new Promise(r => servidor.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const repo = criarRepo()
  const biblioteca = criarBibliotecaViva({ repo })
  const notificar = transporteCaixa(repo, { log: false })
  const recebidos = []
  const webhooks = criarWebhooks({
    repo, log: false,
    fetchFn: fetchWebhook || (async (url, opts) => { recebidos.push({ url, ...opts }); return new Response('ok', { status: 200 }) }),
  })
  const plataforma = criarPlataforma({ repo, notificar, config: { baseUrl: base } })
  const servico = criarServico({ repo, biblioteca, notificar, config: { baseUrl: base }, aoEvento: webhooks.emitir, carimbador, icp, ...(agora ? { agora } : {}) })
  const lotes = criarLotes({ repo, biblioteca, servico })
  const agenda = criarAgenda({ repo, servico, notificar, aoEvento: webhooks.emitir, config: { baseUrl: base }, ...(agora ? { agora } : {}) })
  const indices = criarIndices({ fetchFn: fetchIndices || (async () => { throw new Error('sem rede no teste') }) })
  await plataforma.importarOrganizacoes({ org1: { api_key: CHAVE, dados: ORG } })
  servidor.on('request', criarApp({ servico, lotes, plataforma, webhooks, agenda, indices, repo, biblioteca, dev: true, log: false, chaveDev: CHAVE }))

  const api = (caminho, { metodo = 'GET', corpo, chave = CHAVE, sessao, cookie, cabecalhos = {} } = {}) =>
    fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(chave ? { authorization: `Bearer ${chave}` } : {}),
        ...(sessao ? { 'x-sessao': sessao } : {}),
        ...(cookie ? { cookie } : {}),
        ...cabecalhos,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    })
  const json = async (r) => ({ status: r.status, corpo: await r.json(), r })
  const caixa = (para, tipo) => repo.listar('caixa', m => m.para === para && m.meta.tipo === tipo).at(-1)

  // Entra no painel e devolve o cookie da sessão.
  async function entrar(email, senha = SENHA) {
    const r = await api('/painel/api/sessao', { metodo: 'POST', chave: null, corpo: { email, senha } })
    if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${await r.text()}`)
    return r.headers.get('set-cookie').split(';')[0]
  }

  return { servidor, base, repo, plataforma, servico, webhooks, lotes, agenda, recebidos, api, json, caixa, entrar, fechar: () => servidor.close() }
}

// Assina um contrato como o signatário faria pelo link.
export async function assinarPeloLink({ servico, caixa }, email, nome) {
  const token = caixa(email, 'link').meta.link.split('/assinar/')[1]
  await servico.solicitarCodigo(token, {})
  const { sessao } = servico.validarCodigo(token, caixa(email, 'codigo').meta.codigo, {})
  for (const cl of servico.conteudo(token, sessao).clausulas.filter(c => c.critica)) servico.darCiencia(token, sessao, cl.chave, {}, {})
  servico.registrarLeitura(token, sessao, {}, {})
  return servico.assinar(token, sessao, { nome_digitado: nome, concordo: true }, {})
}
