// HTTP da Fase 2. Só traduz: regra de negócio fica em assinatura/servico.js.
//
// Três superfícies, com autenticação diferente:
//   /v1/*            organização — chave de API (Bearer)
//   /api/assinar/*   signatário  — token do link + sessão aberta pelo código
//   /api/verificar/* público     — código de verificação do selo
// E /dev/* só existe fora de produção (caixa de saída e atalhos de teste).

import express from 'express'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gerarDossiePdf } from '../assinatura/dossie-pdf.js'
import { ErroNegocio } from '../assinatura/servico.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLICO = join(RAIZ, 'public')

export function criarApp({ servico, lotes, repo, biblioteca, organizacoes, dev = false, log = true }) {
  const app = express()
  app.disable('x-powered-by')
  // Atrás do proxy do EasyPanel: o IP real vem no X-Forwarded-For. É evidência
  // da assinatura, então tem de ser o do signatário e não o do proxy.
  app.set('trust proxy', true)
  app.use(express.json({ limit: '1mb' }))

  app.use((req, res, next) => {
    // O token está na URL do link: sem isto ele vaza no Referer de qualquer
    // recurso externo que a página carregue.
    res.set('Referrer-Policy', 'no-referrer')
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('X-Frame-Options', 'DENY')
    if (log) {
      const inicio = Date.now()
      res.on('finish', () => console.log(`${req.method} ${mascararCaminho(req.originalUrl)} ${res.statusCode} ${Date.now() - inicio}ms`))
    }
    next()
  })

  const ctx = (req) => ({ ip: req.ip, user_agent: req.get('user-agent') || null })
  const h = (fn) => async (req, res, next) => {
    try { await fn(req, res) } catch (e) { next(e) }
  }

  // ── Organização ───────────────────────────────────────────────────────────
  const v1 = express.Router()
  v1.use((req, res, next) => {
    const chave = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const org = Object.entries(organizacoes).find(([, o]) => o.api_key && o.api_key === chave)
    if (!org) return res.status(401).json({ erro: 'Chave de API inválida.' })
    req.org = { id: org[0], ...org[1] }
    next()
  })
  v1.get('/modelos', (req, res) => {
    res.json(biblioteca.modelos.map(m => ({
      chave: m.chave, versao: m.versao, titulo: m.titulo, descricao: m.descricao,
      variaveis: m.variaveis.filter(v => v.origem !== 'organizacao').map(({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria }) => ({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria })),
    })))
  })
  v1.post('/contratos', h(async (req, res) => {
    const { modelo, dados } = req.body || {}
    res.status(201).json(await servico.gerar({ organizacaoId: req.org.id, organizacao: req.org.dados, modelo, dados }))
  }))
  v1.get('/contratos/:id', (req, res) => res.json(servico.consultar(req.params.id, req.org.id)))
  v1.post('/contratos/:id/enviar', h(async (req, res) => res.json(await servico.enviar(req.params.id, req.org.id, req.body))))
  v1.post('/contratos/:id/signatarios/:sid/reenviar', h(async (req, res) => res.json(await servico.reenviar(req.params.id, req.org.id, req.params.sid))))
  v1.post('/contratos/:id/cancelar', (req, res) => res.json(servico.cancelar(req.params.id, req.org.id, req.body?.motivo)))
  v1.get('/contratos/:id/arquivo', (req, res) => enviarPdf(res, servico.arquivo(req.params.id, req.org.id, req.query.qual)))
  v1.get('/contratos/:id/dossie', h(async (req, res) => {
    const d = servico.dossie(req.params.id, req.org.id)
    if (req.query.formato === 'pdf') return enviarPdf(res, { buffer: await gerarDossiePdf(d), nome: `dossie-${d.contrato.id}.pdf` })
    res.json(d)
  }))

  // Lote: planilha → mapeamento → prévia → criar → progresso
  const planilhaCrua = express.raw({ type: () => true, limit: '10mb' })
  v1.post('/lotes/planilha', planilhaCrua, h(async (req, res) => {
    res.status(201).json(await lotes.receberPlanilha(req.org.id, req.body, String(req.query.nome || '')))
  }))
  v1.get('/lotes/planilha/:id/sugestao', (req, res) => res.json(lotes.sugerir(req.org.id, req.params.id, req.query.modelo)))
  v1.post('/lotes/previa', (req, res) => res.json(lotes.previa(req.org.id, req.org.dados, req.body || {})))
  v1.post('/lotes', h(async (req, res) => res.status(201).json(await lotes.criar(req.org.id, req.org.dados, req.body || {}))))
  v1.get('/lotes', (req, res) => res.json(lotes.listar(req.org.id)))
  v1.get('/lotes/:id', (req, res) => res.json(lotes.progresso(req.org.id, req.params.id)))
  v1.post('/lotes/:id/lembrar', h(async (req, res) => res.json(await lotes.lembrar(req.org.id, req.params.id))))
  v1.get('/lotes/:id/relatorio.csv', (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8')
    res.set('Content-Disposition', `attachment; filename="lote-${req.params.id.slice(0, 8)}.csv"`)
    res.send(lotes.relatorioCsv(req.org.id, req.params.id))
  })
  app.use('/v1', v1)

  // ── Signatário ────────────────────────────────────────────────────────────
  const assinar = express.Router({ mergeParams: true })
  assinar.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  const limitador = limitarPorIp({ janelaMs: 10 * 60e3, maximo: 20 })
  const sess = (req) => req.get('x-sessao')
  assinar.get('/', (req, res) => res.json(servico.abrir(req.params.token, ctx(req))))
  assinar.post('/codigo', limitador, h(async (req, res) => res.json(await servico.solicitarCodigo(req.params.token, ctx(req)))))
  assinar.post('/codigo/validar', limitador, (req, res) => res.json(servico.validarCodigo(req.params.token, req.body?.codigo, ctx(req))))
  assinar.get('/conteudo', (req, res) => res.json(servico.conteudo(req.params.token, sess(req))))
  assinar.post('/ciencia', (req, res) => res.json(servico.darCiencia(req.params.token, sess(req), req.body?.clausula, req.body, ctx(req))))
  assinar.post('/leitura', (req, res) => res.json(servico.registrarLeitura(req.params.token, sess(req), req.body, ctx(req))))
  assinar.post('/assinar', h(async (req, res) => res.json(await servico.assinar(req.params.token, sess(req), req.body, ctx(req)))))
  assinar.post('/recusar', (req, res) => res.json(servico.recusar(req.params.token, sess(req), req.body, ctx(req))))
  assinar.get('/arquivo', (req, res) => enviarPdf(res, servico.arquivoDoSignatario(req.params.token, sess(req), req.query.qual)))
  app.use('/api/assinar/:token', assinar)

  // ── Representante assinando o lote ────────────────────────────────────────
  const lote = express.Router({ mergeParams: true })
  lote.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
  lote.get('/', (req, res) => res.json(servico.abrirLote(req.params.token, ctx(req))))
  lote.post('/codigo', limitador, h(async (req, res) => res.json(await servico.solicitarCodigoLote(req.params.token, ctx(req)))))
  lote.post('/codigo/validar', limitador, (req, res) => res.json(servico.validarCodigoLote(req.params.token, req.body?.codigo, ctx(req))))
  lote.get('/conteudo', (req, res) => res.json(servico.conteudoLote(req.params.token, sess(req))))
  lote.post('/ciencia', (req, res) => res.json(servico.darCienciaLote(req.params.token, sess(req), req.body?.clausula, req.body, ctx(req))))
  lote.post('/leitura', (req, res) => res.json(servico.registrarLeituraLote(req.params.token, sess(req), req.body, ctx(req))))
  lote.post('/assinar', h(async (req, res) => res.json(await servico.assinarLote(req.params.token, sess(req), req.body, ctx(req)))))
  app.use('/api/lote/:token', lote)

  // ── Público ───────────────────────────────────────────────────────────────
  app.get('/api/verificar/:codigo', (req, res) => {
    const v = servico.verificar(req.params.codigo)
    if (!v) return res.status(404).json({ erro: 'Nenhum contrato com este código.' })
    res.json(v)
  })
  app.post('/api/verificar/:codigo/conferir', (req, res) => {
    const r = servico.conferirHash(req.params.codigo, req.body?.sha256)
    if (!r) return res.status(404).json({ erro: 'Nenhum contrato com este código.' })
    res.json(r)
  })

  // ── Páginas ───────────────────────────────────────────────────────────────
  const pagina = (arquivo) => (req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    res.sendFile(join(PUBLICO, arquivo))
  }
  app.get('/assinar/:token', pagina('assinar.html'))
  app.get('/lote/:token', pagina('lote.html'))
  app.get(['/v/:codigo', '/verificar'], pagina('verificar.html'))
  app.get('/', (req, res) => res.redirect(dev ? '/dev' : '/verificar'))
  app.use('/estatico', express.static(join(PUBLICO, 'estatico'), { maxAge: dev ? 0 : '1h' }))

  // ── Desenvolvimento ───────────────────────────────────────────────────────
  if (dev) {
    const orgDev = Object.entries(organizacoes)[0]
    app.get('/dev', pagina('dev.html'))
    app.get('/dev/lotes', pagina('lotes.html'))
    app.get('/dev/exemplo-funcionarios.csv', (req, res) => res.download(join(RAIZ, 'exemplos', 'planilhas', 'funcionarios.csv'), 'funcionarios-exemplo.csv'))
    app.get('/dev/api/estado', (req, res) => {
      res.json({
        organizacao: { id: orgDev[0], nome: orgDev[1].dados.razao_social, api_key: orgDev[1].api_key },
        exemplos: lerExemplos(),
        contratos: repo.listar('contratos', c => c.organizacao_id === orgDev[0])
          .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
          .map(c => ({ id: c.id, titulo: c.titulo, status: c.status, criado_em: c.criado_em, codigo_verificacao: c.codigo_verificacao || null })),
        caixa: repo.listar('caixa').sort((a, b) => b.em.localeCompare(a.em)).slice(0, 40),
      })
    })
  }

  // ── Erros ─────────────────────────────────────────────────────────────────
  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }))
  app.use((err, req, res, _next) => {
    if (err instanceof ErroNegocio) return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' })
    if (/não existe \(há:/.test(err.message)) return res.status(400).json({ erro: err.message })
    console.error(err)
    res.status(500).json({ erro: 'Erro interno.' })
  })
  return app
}

function enviarPdf(res, { buffer, nome, sha256 }) {
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', `attachment; filename="${nome}"`)
  res.set('Cache-Control', 'no-store')
  if (sha256) res.set('X-Conteudo-Sha256', sha256)
  res.send(buffer)
}

// O token do link e a sessão não vão para o log (o stdout vai para o EasyPanel).
export function mascararCaminho(p) {
  return String(p).replace(/(\/(?:assinar|lote)\/)[^/?]+/, '$1***')
}

function limitarPorIp({ janelaMs, maximo }) {
  const contagem = new Map()
  return (req, res, next) => {
    const agora = Date.now()
    const k = req.ip
    const r = contagem.get(k)
    if (!r || agora - r.inicio > janelaMs) contagem.set(k, { inicio: agora, n: 1 })
    else if (++r.n > maximo) return res.status(429).json({ erro: 'Muitas tentativas. Espere alguns minutos.' })
    next()
  }
}

function lerExemplos() {
  const dir = join(RAIZ, 'exemplos')
  return readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => {
    const e = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    return { nome: f.replace(/\.json$/, ''), ...e }
  })
}
