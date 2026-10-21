// HTTP. Só traduz: regra de negócio fica nos serviços.
//
// Superfícies e como cada uma se autentica:
//   /v1/*                 sistema da organização  — chave de API (Bearer)
//   /painel/api/org/*     pessoa da organização   — sessão do painel (cookie); MESMAS rotas do /v1
//   /painel/api/admin/*   administrador da org    — sessão, papel org_admin
//   /painel/api/plataforma/*  developer           — sessão, papel developer
//   /api/assinar/*, /api/lote/*  quem assina      — token do link + sessão aberta pelo código
//   /api/verificar/*      público                 — código do selo
//   /dev/*                só fora de produção     — caixa de saída e contrato avulso de teste

import express from 'express'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gerarDossiePdf } from '../assinatura/dossie-pdf.js'
import { ErroBiblioteca, acharModelo } from '../biblioteca.js'
import { signatariosDaLinha } from '../lote/mapear.js'
import { camposNecessarios, montarContrato } from '../motor/montar.js'
import { humanizar } from '../motor/texto-modelo.js'
import { ErroNegocio } from '../assinatura/servico.js'
import { EVENTOS_WEBHOOK } from '../plataforma/webhooks.js'
import { periodoPadrao } from '../vida/indices.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLICO = join(RAIZ, 'public')
const PAINEL = join(PUBLICO, 'painel')
const COOKIE = 'cs_painel'
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

export function criarApp({ servico, lotes, plataforma, webhooks, agenda, indices, repo, biblioteca, partes = null, dev = false, log = true, chaveDev = null }) {
  const app = express()
  app.disable('x-powered-by')
  // Atrás do proxy do EasyPanel: o IP real vem no X-Forwarded-For (é evidência
  // da assinatura) e o https no X-Forwarded-Proto (decide o cookie Secure).
  app.set('trust proxy', true)
  app.use(express.json({ limit: '1mb' }))

  app.use((req, res, next) => {
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
    try { await fn(req, res, next) } catch (e) { next(e) }
  }

  // ── Rotas da organização (iguais para /v1 e para o painel) ────────────────
  // `req.acesso` = { org, pode_escrever, ator } — quem montou foi a autenticação.
  function rotasDaOrganizacao() {
    const r = express.Router()
    r.use((req, res, next) => {
      const { org, pode_escrever } = req.acesso
      if (req.method !== 'GET') {
        if (!pode_escrever) return res.status(403).json({ erro: 'Seu acesso é só de leitura.' })
        if (org.status !== 'ativa') return res.status(403).json({ erro: 'Organização suspensa: consulta liberada, alterações bloqueadas. Fale com o suporte da plataforma.' })
      }
      next()
    })
    const org = (req) => req.acesso.org
    const dados = (req) => repo.obter('organizacoes', org(req).id).dados
    // A organização só gera com modelo publicado. Aditivo e distrato nascem de
    // um contrato e não passam por aqui.
    const exigirPublicado = (chave) => {
      if (!biblioteca.estaPublicado(chave)) throw new ErroNegocio(404, 'Este modelo não está disponível. Escolha um dos modelos publicados.')
      return chave
    }

    r.get('/conta', (req, res) => res.json(plataforma.resumoOrganizacao(repo.obter('organizacoes', org(req).id))))
    r.get('/modelos', (req, res) => {
      // Aditivo e distrato não aparecem aqui: nascem de um contrato assinado (rota própria).
      res.json(biblioteca.publicados.filter(m => !m.derivado).map(m => ({
        chave: m.chave, versao: m.versao, titulo: m.titulo, descricao: m.descricao,
        variaveis: m.variaveis.filter(v => v.origem !== 'organizacao').map(({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria }) => ({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria })),
        signatarios_da_parte: m.signatarios_da_parte || [],
      })))
    })

    // Formulário dinâmico: dado o que já foi preenchido, quais campos este
    // contrato precisa, o que falta, o que está inválido e quem assina.
    r.post('/modelos/:chave/conferir', (req, res) => {
      const modelo = acharModelo(biblioteca, exigirPublicado(req.params.chave))
      const d = { ...(req.body?.dados || {}), organizacao: dados(req) }
      const necessarios = camposNecessarios({ modelo, biblioteca: biblioteca.indice, dados: d })
      const m = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: d })
      res.json({
        necessarios: modelo.variaveis.filter(v => v.origem !== 'organizacao' && necessarios.has(v.chave)).map(v => v.chave),
        faltando: m.faltando,
        invalidos: m.invalidos,
        pronto: m.ok,
        signatarios: signatariosDaLinha(modelo, d),
      })
    })

    // Prévia: o contrato montado com o que já foi preenchido, lacunas marcadas
    // como {{variável}}. É leitura, não cria nada nem conta no plano.
    r.post('/modelos/:chave/previa', (req, res) => {
      const modelo = acharModelo(biblioteca, exigirPublicado(req.params.chave))
      const d = { ...(req.body?.dados || {}), organizacao: dados(req) }
      const m = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: d })
      const rotulos = Object.fromEntries(modelo.variaveis.map(v => [v.chave, v.rotulo]))
      res.json({ pronto: m.ok, contrato: m.contrato, faltando: m.faltando, invalidos: m.invalidos, rotulos })
    })

    r.get('/contratos', (req, res) => res.json(servico.listarContratos(org(req).id, req.query)))
    r.post('/contratos', h(async (req, res) => {
      plataforma.checarLimite(org(req).id, 1)
      const { modelo, dados: d, referencia } = req.body || {}
      exigirPublicado(modelo)
      res.status(201).json(await servico.gerar({ organizacaoId: org(req).id, organizacao: dados(req), modelo, dados: d, referencia }))
    }))
    r.get('/contratos/:id', (req, res) => res.json(servico.consultar(req.params.id, org(req).id)))
    r.post('/contratos/:id/enviar', h(async (req, res) => res.json(await servico.enviar(req.params.id, org(req).id, req.body, { ator: req.acesso.ator }))))
    r.post('/contratos/:id/signatarios/:sid/reenviar', h(async (req, res) => res.json(await servico.reenviar(req.params.id, org(req).id, req.params.sid))))
    r.post('/contratos/:id/cancelar', (req, res) => res.json(servico.cancelar(req.params.id, org(req).id, req.body?.motivo)))
    r.get('/contratos/:id/arquivo', h(async (req, res) => enviarPdf(res, await servico.arquivo(req.params.id, org(req).id, req.query.qual))))
    r.get('/contratos/:id/assinaturas/:sid/arquivo', h(async (req, res) => enviarPdf(res, await servico.arquivoIcp(req.params.id, org(req).id, req.params.sid))))
    // Token RFC 3161, para o perito: openssl ts -verify -data <pdf assinado> -in <este arquivo> -CAfile <cadeia da ACT>
    r.get('/contratos/:id/carimbo.tsr', h(async (req, res) => {
      const { buffer, nome } = await servico.arquivoCarimbo(req.params.id, org(req).id)
      if (!buffer) return res.status(404).json({ erro: 'Carimbo indisponível no momento. Tente de novo em instantes.' })
      res.set('Content-Type', 'application/timestamp-reply')
      res.set('Content-Disposition', `attachment; filename="${nome}"`)
      res.send(buffer)
    }))
    r.get('/contratos/:id/dossie', h(async (req, res) => {
      const d = servico.dossie(req.params.id, org(req).id)
      if (req.query.formato === 'pdf') return enviarPdf(res, { buffer: await gerarDossiePdf(d), nome: `dossie-${d.contrato.id}.pdf` })
      res.json(d)
    }))

    // Contrato vivo: aditivo e distrato nascem de um contrato assinado.
    r.post('/contratos/:id/aditivo', h(async (req, res) => {
      plataforma.checarLimite(org(req).id, 1)
      res.status(201).json(await servico.gerarDerivado(req.params.id, org(req).id, dados(req), 'aditivo', req.body?.campos || req.body || {}))
    }))
    r.post('/contratos/:id/distrato', h(async (req, res) => {
      plataforma.checarLimite(org(req).id, 1)
      res.status(201).json(await servico.gerarDerivado(req.params.id, org(req).id, dados(req), 'distrato', req.body?.campos || req.body || {}))
    }))
    r.get('/agenda', (req, res) => res.json(agenda.proximos(org(req).id, Math.min(Number(req.query.dias) || 90, 365))))
    // Acumulado do índice no período (ou no período padrão antes de uma data de reajuste).
    r.get('/indices/:indice', h(async (req, res) => {
      const p = req.query.para ? periodoPadrao(String(req.query.para)) : { de: String(req.query.de || ''), ate: String(req.query.ate || '') }
      res.json(await indices.acumulado(req.params.indice, p.de, p.ate))
    }))

    // Diretório de partes: quem já recebeu contrato desta organização, para
    // o próximo não ser digitado do zero. Só leitura: quem escreve é a geração.
    r.get('/partes', (req, res) => res.json(partes.listar(org(req).id, req.query)))
    r.get('/partes/:id', (req, res) => res.json(partes.obter(org(req).id, req.params.id)))

    const planilhaCrua = express.raw({ type: () => true, limit: '10mb' })
    r.post('/lotes/planilha', planilhaCrua, h(async (req, res) => {
      res.status(201).json(await lotes.receberPlanilha(org(req).id, req.body, String(req.query.nome || '')))
    }))
    r.get('/lotes/planilha/:id/sugestao', (req, res) => res.json(lotes.sugerir(org(req).id, req.params.id, exigirPublicado(req.query.modelo))))
    r.post('/lotes/previa', (req, res) => res.json(lotes.previa(org(req).id, dados(req), { ...req.body, modelo: exigirPublicado(req.body?.modelo) })))
    r.post('/lotes', h(async (req, res) => {
      exigirPublicado(req.body?.modelo)
      const p = lotes.previa(org(req).id, dados(req), req.body || {})
      plataforma.checarLimite(org(req).id, p.prontas)
      res.status(201).json(await lotes.criar(org(req).id, dados(req), req.body || {}))
    }))
    r.get('/lotes', (req, res) => res.json(lotes.listar(org(req).id)))
    r.get('/lotes/:id', (req, res) => res.json(lotes.progresso(org(req).id, req.params.id)))
    r.post('/lotes/:id/lembrar', h(async (req, res) => res.json(await lotes.lembrar(org(req).id, req.params.id))))
    r.get('/lotes/:id/relatorio.csv', (req, res) => {
      res.set('Content-Type', 'text/csv; charset=utf-8')
      res.set('Content-Disposition', `attachment; filename="lote-${req.params.id.slice(0, 8)}.csv"`)
      res.send(lotes.relatorioCsv(org(req).id, req.params.id))
    })
    return r
  }

  // /v1: chave de API
  app.use('/v1', (req, res, next) => {
    const valor = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const a = plataforma.autenticarChave(valor)
    if (!a) return res.status(401).json({ erro: 'Chave de API inválida ou revogada.' })
    req.acesso = { org: a.organizacao, pode_escrever: a.chave.escopo === 'escrita', ator: { id: a.chave.id, tipo: 'chave_api', email: null } }
    next()
  }, rotasDaOrganizacao())

  // ── Painel: sessão por cookie ─────────────────────────────────────────────
  const painel = express.Router()
  painel.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    // CSRF: o cookie é SameSite=Strict, e escrita só aceita o que um <form>
    // de outro site não consegue mandar (JSON ou arquivo cru).
    if (req.method !== 'GET' && /^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain)/i.test(req.get('content-type') || '')) {
      return res.status(403).json({ erro: 'Tipo de requisição não aceito.' })
    }
    const s = plataforma.sessaoDe(lerCookie(req, COOKIE))
    req.usuario = s?.usuario || null
    req.organizacaoDoUsuario = s?.organizacao || null
    next()
  })

  const gravarCookie = (req, res, valor) => {
    const partes = [`${COOKIE}=${valor}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${valor ? 12 * 3600 : 0}`]
    if (req.secure) partes.push('Secure')
    res.append('Set-Cookie', partes.join('; '))
  }
  const eu = (u, org) => ({
    usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel, papel_rotulo: plataforma.PAPEIS[u.papel] },
    organizacao: org ? { id: org.id, nome: org.dados.razao_social, status: org.status } : null,
  })

  const limitadorLogin = limitarPorIp({ janelaMs: 10 * 60e3, maximo: 30 })
  painel.post('/sessao', limitadorLogin, (req, res) => {
    const { sessao, usuario } = plataforma.login(req.body?.email, req.body?.senha, ctx(req))
    gravarCookie(req, res, sessao)
    const u = repo.obter('usuarios', usuario.id)
    res.json(eu(u, u.organizacao_id ? repo.obter('organizacoes', u.organizacao_id) : null))
  })
  painel.delete('/sessao', (req, res) => {
    plataforma.sair(lerCookie(req, COOKIE))
    gravarCookie(req, res, '')
    res.json({ ok: true })
  })
  painel.get('/convite/:token', (req, res) => res.json(plataforma.verConvite(req.params.token)))
  painel.post('/convite/:token', limitadorLogin, (req, res) => {
    const { sessao, usuario } = plataforma.aceitarConvite(req.params.token, req.body?.senha, ctx(req))
    gravarCookie(req, res, sessao)
    const u = repo.obter('usuarios', usuario.id)
    res.json(eu(u, u.organizacao_id ? repo.obter('organizacoes', u.organizacao_id) : null))
  })

  const exigirLogin = (req, res, next) => (req.usuario ? next() : res.status(401).json({ erro: 'Entre de novo: sua sessão terminou.' }))
  const exigirPapel = (...papeis) => (req, res, next) => (papeis.includes(req.usuario.papel) ? next() : res.status(403).json({ erro: 'Seu papel não dá acesso a isto.' }))

  // Sem sessão é uma resposta normal ("ninguém"), não um erro: o painel pergunta isto ao abrir.
  painel.get('/eu', (req, res) => res.json(req.usuario ? eu(req.usuario, req.organizacaoDoUsuario) : null))
  painel.post('/eu/senha', exigirLogin, (req, res) => {
    const { sessao } = plataforma.trocarSenha(req.usuario.id, req.body?.atual, req.body?.nova)
    gravarCookie(req, res, sessao)
    res.json({ ok: true })
  })
  // Senha esquecida: pede o link (resposta igual com ou sem conta) e redefine, já entrando.
  painel.post('/senha/esquecida', limitadorLogin, h(async (req, res) => res.json(await plataforma.pedirRedefinicao(req.body?.email, ctx(req)))))
  painel.get('/redefinir/:token', (req, res) => res.json(plataforma.verRedefinicao(req.params.token)))
  painel.post('/redefinir/:token', limitadorLogin, (req, res) => {
    const { sessao, usuario } = plataforma.redefinirSenha(req.params.token, req.body?.senha, ctx(req))
    gravarCookie(req, res, sessao)
    const u = repo.obter('usuarios', usuario.id)
    res.json(eu(u, u.organizacao_id ? repo.obter('organizacoes', u.organizacao_id) : null))
  })

  // Rotas da organização para quem está logado. O developer pode ABRIR uma
  // organização só para leitura (suporte), dizendo qual no cabeçalho.
  painel.use('/org', exigirLogin, (req, res, next) => {
    const u = req.usuario
    if (u.papel === 'developer') {
      const id = req.get('x-organizacao')
      const org = id && repo.obter('organizacoes', id)
      if (!org) return res.status(400).json({ erro: 'Escolha a organização a consultar.' })
      if (req.method !== 'GET') return res.status(403).json({ erro: 'O suporte da plataforma só consulta; quem altera é a própria organização.' })
      if (req.path === '/contratos' || req.path === '/lotes') plataforma.auditar(u, 'suporte.consulta', { organizacao_id: org.id, dados: { rota: req.path } })
      req.acesso = { org, pode_escrever: false, ator: u }
      return next()
    }
    req.acesso = { org: req.organizacaoDoUsuario, pode_escrever: ['org_admin', 'emissor'].includes(u.papel), ator: u }
    next()
  }, rotasDaOrganizacao())

  // Administração da organização
  const admin = express.Router()
  admin.use(exigirLogin, exigirPapel('org_admin'), (req, res, next) => {
    req.orgId = req.usuario.organizacao_id
    if (req.method !== 'GET' && req.organizacaoDoUsuario?.status !== 'ativa') return res.status(403).json({ erro: 'Organização suspensa.' })
    next()
  })
  admin.get('/empresa', (req, res) => res.json({ ...plataforma.resumoOrganizacao(plataforma.obterOrganizacao(req.orgId)), campos: plataforma.CAMPOS_ORGANIZACAO }))
  admin.put('/empresa', (req, res) => res.json(plataforma.atualizarOrganizacao(req.orgId, { dados: req.body?.dados || {} }, req.usuario)))
  admin.get('/usuarios', (req, res) => res.json(plataforma.listarUsuarios(req.orgId)))
  admin.post('/usuarios', h(async (req, res) => res.status(201).json(await plataforma.convidar({ organizacaoId: req.orgId, ...pick(req.body, ['nome', 'email', 'papel']) }, req.usuario))))
  admin.patch('/usuarios/:id', (req, res) => res.json(plataforma.alterarUsuario(req.orgId, req.params.id, req.body || {}, req.usuario)))
  admin.get('/chaves', (req, res) => res.json(plataforma.listarChaves(req.orgId)))
  admin.post('/chaves', (req, res) => res.status(201).json(plataforma.criarChave(req.orgId, req.body || {}, req.usuario)))
  admin.delete('/chaves/:id', (req, res) => res.json(plataforma.revogarChave(req.orgId, req.params.id, req.usuario)))
  admin.get('/webhooks', (req, res) => res.json({ webhooks: webhooks.listar(req.orgId), eventos: EVENTOS_WEBHOOK }))
  admin.post('/webhooks', h(async (req, res) => {
    const w = await webhooks.criar(req.orgId, req.body || {})
    plataforma.auditar(req.usuario, 'webhook.criado', { organizacao_id: req.orgId, alvo: w.url })
    res.status(201).json(w)
  }))
  admin.patch('/webhooks/:id', h(async (req, res) => {
    const w = await webhooks.atualizar(req.orgId, req.params.id, req.body || {})
    plataforma.auditar(req.usuario, 'webhook.alterado', { organizacao_id: req.orgId, alvo: w.url, dados: { campos: Object.keys(req.body || {}) } })
    res.json(w)
  }))
  admin.delete('/webhooks/:id', (req, res) => {
    webhooks.remover(req.orgId, req.params.id)
    plataforma.auditar(req.usuario, 'webhook.removido', { organizacao_id: req.orgId, alvo: req.params.id })
    res.json({ ok: true })
  })
  admin.get('/webhooks/:id/segredo', (req, res) => {
    plataforma.auditar(req.usuario, 'webhook.segredo_visto', { organizacao_id: req.orgId, alvo: req.params.id })
    res.json(webhooks.segredo(req.orgId, req.params.id))
  })
  admin.get('/entregas', (req, res) => res.json(webhooks.listarEntregas(req.orgId, { webhookId: req.query.webhook })))
  admin.post('/entregas/:id/reenviar', (req, res) => res.json(webhooks.reenviar(req.orgId, req.params.id)))
  admin.get('/auditoria', (req, res) => res.json(plataforma.listarAuditoria({ organizacaoId: req.orgId })))
  painel.use('/admin', admin)

  // Plataforma (developer)
  const dono = express.Router()
  dono.use(exigirLogin, exigirPapel('developer'))
  dono.get('/organizacoes', (req, res) => res.json({ organizacoes: plataforma.listarOrganizacoes(), planos: plataforma.PLANOS, campos: plataforma.CAMPOS_ORGANIZACAO }))
  dono.post('/organizacoes', h(async (req, res) => res.status(201).json(await plataforma.criarOrganizacao(req.body || {}, req.usuario))))
  dono.get('/organizacoes/:id', (req, res) => res.json({
    ...plataforma.resumoOrganizacao(plataforma.obterOrganizacao(req.params.id)),
    ...plataforma.listarUsuarios(req.params.id),
    chaves: plataforma.listarChaves(req.params.id),
    webhooks: webhooks.listar(req.params.id),
    auditoria: plataforma.listarAuditoria({ organizacaoId: req.params.id, limite: 30 }),
  }))
  dono.patch('/organizacoes/:id', (req, res) => res.json(plataforma.atualizarOrganizacao(req.params.id, req.body || {}, req.usuario)))
  dono.post('/organizacoes/:id/usuarios', h(async (req, res) => res.status(201).json(await plataforma.convidar({ organizacaoId: req.params.id, ...pick(req.body, ['nome', 'email', 'papel']) }, req.usuario))))
  dono.post('/developers', h(async (req, res) => res.status(201).json(await plataforma.convidar({ ...pick(req.body, ['nome', 'email']), papel: 'developer' }, req.usuario))))
  dono.get('/saude', (req, res) => res.json(saude()))

  // Biblioteca: o developer edita cláusulas (sempre versão nova) e modelos
  // (salvar vira rascunho; publicar exige linter ok). Organizações só veem o publicado.
  const b = (fn) => (req, res, next) => { try { res.json(fn(req)) } catch (e) { next(e) } }
  dono.get('/biblioteca', b(() => biblioteca.resumo()))
  dono.get('/biblioteca/modelos/:chave', b(req => biblioteca.obterModelo(req.params.chave)))
  dono.put('/biblioteca/modelos/:chave', b(req => {
    const salvo = biblioteca.salvarModelo({ ...req.body, chave: req.params.chave })
    plataforma.auditar(req.usuario, 'modelo.salvo', { alvo: req.params.chave })
    return salvo
  }))
  dono.post('/biblioteca/modelos', b(req => {
    const { copiar_de, chave, titulo } = req.body || {}
    const m = copiar_de ? biblioteca.duplicarModelo(copiar_de, chave, titulo) : biblioteca.salvarModelo({ chave, titulo, variaveis: [], blocos: [{ clausula: 'partes', versao: 1 }] })
    plataforma.auditar(req.usuario, 'modelo.criado', { alvo: chave, dados: { copiar_de: copiar_de || null } })
    return m
  }))
  dono.post('/biblioteca/modelos/:chave/publicar', b(req => {
    const m = biblioteca.publicarModelo(req.params.chave)
    plataforma.auditar(req.usuario, 'modelo.publicado', { alvo: req.params.chave, dados: { versao: m.versao } })
    return m
  }))
  dono.post('/biblioteca/modelos/:chave/despublicar', b(req => {
    plataforma.auditar(req.usuario, 'modelo.despublicado', { alvo: req.params.chave })
    return biblioteca.despublicarModelo(req.params.chave)
  }))
  dono.post('/biblioteca/modelos/:chave/lint', b(req => biblioteca.lintar({ ...req.body, chave: req.params.chave })))
  // Prévia com dados de exemplo: o que a pessoa vai ler, com lacunas marcadas.
  dono.post('/biblioteca/modelos/:chave/previa', b(req => {
    const modelo = req.body?.modelo || biblioteca.obterModelo(req.params.chave)
    const organizacao = req.body?.organizacao || JSON.parse(readFileSync(join(RAIZ, 'exemplos', '_organizacao.json'), 'utf8'))
    const m = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: { organizacao, ...(req.body?.dados || {}) } })
    return { pronto: m.ok, contrato: m.contrato, faltando: m.faltando, invalidos: m.invalidos, rotulos: Object.fromEntries((modelo.variaveis || []).map(v => [v.chave, v.rotulo])) }
  }))
  dono.get('/biblioteca/clausulas/:chave', b(req => biblioteca.obterClausula(req.params.chave, req.query.versao)))
  dono.post('/biblioteca/clausulas', b(req => {
    const c = biblioteca.salvarClausula(req.body || {})
    plataforma.auditar(req.usuario, 'clausula.salva', { alvo: `${c.chave}@${c.versao}` })
    return c
  }))
  dono.post('/biblioteca/clausulas/:chave/aplicar', b(req => {
    const r = biblioteca.atualizarVersaoNosModelos(req.params.chave, Number(req.body?.versao), req.body?.modelos || [])
    plataforma.auditar(req.usuario, 'clausula.aplicada', { alvo: `${req.params.chave}@${req.body?.versao}`, dados: { modelos: r.afetados } })
    return r
  }))
  dono.get('/auditoria', (req, res) => res.json(plataforma.listarAuditoria({ limite: 200 })))
  painel.use('/plataforma', dono)

  app.use('/painel/api', painel)
  app.use('/painel/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }))

  // O que o developer precisa ver de manhã: o que está quebrado.
  function saude() {
    const agora = Date.now()
    const orgs = new Map(repo.listar('organizacoes').map(o => [o.id, o.dados.razao_social]))
    const contratos = repo.listar('contratos')
    const parados = contratos.filter(c => ['enviado', 'parcialmente_assinado'].includes(c.status) && agora - new Date(c.enviado_em) > 7 * 864e5)
    const falhas = webhooks.falhando()
    const porOrg = (lista) => [...lista.reduce((m, x) => m.set(x.organizacao_id, (m.get(x.organizacao_id) || 0) + 1), new Map())]
      .map(([id, n]) => ({ organizacao_id: id, organizacao: orgs.get(id) || id, n })).sort((a, b) => b.n - a.n)
    const ultimos7 = contratos.filter(c => agora - new Date(c.criado_em) < 7 * 864e5)
    return {
      organizacoes: { total: orgs.size, suspensas: repo.listar('organizacoes', o => o.status !== 'ativa').length },
      contratos: {
        total: contratos.length, ultimos_7_dias: ultimos7.length,
        assinados_7_dias: contratos.filter(c => c.assinado_em && agora - new Date(c.assinado_em) < 7 * 864e5).length,
        parados_7_dias: parados.length, parados_por_organizacao: porOrg(parados),
      },
      webhooks: { com_falha: falhas.length, por_organizacao: porOrg(falhas) },
      caixa_de_saida_recente: repo.listar('caixa').length,
    }
  }

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
  assinar.get('/arquivo', h(async (req, res) => enviarPdf(res, await servico.arquivoDoSignatario(req.params.token, sess(req), req.query.qual))))
  // Assinatura ICP-Brasil: o PDF do contrato, assinado com o certificado de quem assina.
  assinar.post('/icp', express.raw({ type: () => true, limit: '20mb' }), h(async (req, res) => res.json(await servico.assinarComIcp(req.params.token, sess(req), req.body, ctx(req)))))
  app.use('/api/assinar/:token', assinar)

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

  // Demonstração do motor para o site: monta os exemplos do repositório (nunca
  // dados de quem visita) e devolve as cláusulas com bula, numeração e a regra
  // que fez cada uma entrar. É estático, então fica em cache na memória.
  const demo = new Map()
  app.get('/api/demo/contrato', (req, res) => {
    const nome = String(req.query.exemplo || 'pf-determinado')
    if (!demo.has(nome)) {
      const ex = lerExemplos().find(e => e.nome === nome)
      if (!ex) return res.status(404).json({ erro: 'Exemplo desconhecido.' })
      const organizacao = JSON.parse(readFileSync(join(RAIZ, 'exemplos', '_organizacao.json'), 'utf8'))
      const modelo = acharModelo(biblioteca, ex.modelo)
      const m = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: { organizacao, ...ex.dados } })
      const defs = Object.fromEntries(modelo.variaveis.map(v => [v.chave, v]))
      const condicoes = Object.fromEntries(modelo.blocos.filter(b => b.quando).map(b => [b.clausula, humanizar(b.quando, defs)]))
      const tipo = defs['contratado.tipo']?.opcoes?.find(o => o.valor === ex.dados.contratado?.tipo)?.texto || null
      demo.set(nome, {
        exemplo: nome,
        ok: m.ok,
        titulo: m.contrato.titulo,
        contratado: { nome: ex.dados.contratado?.nome || null, tipo },
        clausulas: m.contrato.clausulas.map(c => ({ ...c, condicao: condicoes[c.chave] || null })),
        faltando: m.faltando,
        invalidos: m.invalidos,
      })
    }
    res.set('Cache-Control', 'public, max-age=300')
    res.json(demo.get(nome))
  })

  // ── Páginas ───────────────────────────────────────────────────────────────
  const pagina = (arquivo, raiz = PUBLICO) => (req, res) => {
    res.set('Content-Security-Policy', CSP)
    res.sendFile(join(raiz, arquivo))
  }
  app.get('/assinar/:token', pagina('assinar.html'))
  app.get('/lote/:token', pagina('lote.html'))
  app.get(['/v/:codigo', '/verificar'], pagina('verificar.html'))
  app.use('/estatico', express.static(join(PUBLICO, 'estatico'), { maxAge: dev ? 0 : '1h' }))

  // Painel (React, build do Vite em public/painel). Qualquer rota que não seja
  // arquivo devolve o index.html — quem decide a tela é o roteador do React.
  app.use('/painel/assets', express.static(join(PAINEL, 'assets'), { maxAge: '1y', immutable: true }))
  app.get(['/painel', '/painel/*'], (req, res) => {
    if (!existsSync(join(PAINEL, 'index.html'))) return res.status(503).type('text/plain').send('Painel não compilado. Rode: npm run build')
    res.set('Cache-Control', 'no-cache')
    pagina('index.html', PAINEL)(req, res)
  })
  // Site de apresentação.
  app.get('/', pagina('index.html'))

  // ── Desenvolvimento ───────────────────────────────────────────────────────
  if (dev) {
    app.get('/dev', pagina('dev.html'))
    app.get('/dev/lotes', (req, res) => res.redirect('/painel/lotes'))
    app.get('/dev/exemplo-funcionarios.csv', (req, res) => res.download(join(RAIZ, 'exemplos', 'planilhas', 'funcionarios.csv'), 'funcionarios-exemplo.csv'))
    app.get('/dev/api/estado', (req, res) => {
      const a = plataforma.autenticarChave(chaveDev)
      res.json({
        organizacao: a ? { id: a.organizacao.id, nome: a.organizacao.dados.razao_social, api_key: chaveDev } : null,
        exemplos: lerExemplos(),
        contratos: a ? repo.listar('contratos', c => c.organizacao_id === a.organizacao.id)
          .sort((x, y) => y.criado_em.localeCompare(x.criado_em))
          .map(c => ({ id: c.id, titulo: c.titulo, status: c.status, criado_em: c.criado_em, codigo_verificacao: c.codigo_verificacao || null })) : [],
        caixa: repo.listar('caixa').sort((x, y) => y.em.localeCompare(x.em)).slice(0, 40),
      })
    })
  }

  // ── Erros ─────────────────────────────────────────────────────────────────
  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }))
  app.use((err, req, res, _next) => {
    if (err instanceof ErroNegocio || err instanceof ErroBiblioteca) return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' })
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo grande demais.' })
    if (/não existe \(há:/.test(err.message)) return res.status(400).json({ erro: err.message })
    console.error(err)
    res.status(500).json({ erro: 'Erro interno.' })
  })
  return app
}

function enviarPdf(res, { buffer, nome, sha256 }) {
  // Sem bytes: o arquivo ainda não chegou ao armazenamento (ou se perdeu). Nunca um 200 vazio.
  if (!buffer) return res.status(404).json({ erro: 'Arquivo indisponível no momento. Tente de novo em instantes; se continuar, fale com o suporte.' })
  res.set('Content-Type', 'application/pdf')
  res.set('Content-Disposition', `attachment; filename="${nome}"`)
  res.set('Cache-Control', 'no-store')
  if (sha256) res.set('X-Conteudo-Sha256', sha256)
  res.send(buffer)
}

// Tokens de link, convite e sessão não vão para o log (o stdout vai para o EasyPanel).
export function mascararCaminho(p) {
  return String(p).replace(/(\/(?:assinar|lote|convite)\/)[^/?]+/, '$1***')
}

function lerCookie(req, nome) {
  const m = (req.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : null
}

const pick = (o, ks) => Object.fromEntries(ks.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]))

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
