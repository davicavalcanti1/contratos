// Plataforma (Fase 4): organizações, usuários, convites, sessões do painel,
// chaves de API, planos e auditoria. Hierarquia em docs/ARQUITETURA.md §1-2.
//
//   developer  — global: cria e suspende organizações, define plano, dá suporte
//   org_admin  — 1 organização: usuários, chaves, webhooks, dados da empresa
//   emissor    — gera e envia contratos e lotes; não mexe em configuração
//   leitor     — só consulta e baixa
//
// Segredos (senha, token de convite, sessão, chave de API) só existem como
// hash. O que precisa ser mostrado (chave nova) aparece uma vez, na criação.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { ErroNegocio } from '../assinatura/servico.js'
import { novoToken, sha256 } from '../assinatura/segredos.js'
import { TIPOS } from '../motor/tipos.js'

export const PAPEIS = {
  developer: 'Developer da plataforma',
  org_admin: 'Administrador',
  emissor: 'Emissor',
  leitor: 'Leitor',
}
const PAPEIS_DA_ORG = ['org_admin', 'emissor', 'leitor']

export const PLANOS = {
  teste: { nome: 'Teste', contratos_mes: 20 },
  essencial: { nome: 'Essencial', contratos_mes: 200 },
  profissional: { nome: 'Profissional', contratos_mes: 2000 },
  ilimitado: { nome: 'Ilimitado', contratos_mes: null },
}

// Campos da organização que os modelos usam. Sem eles, nada é gerado — melhor
// a empresa saber no cadastro do que no primeiro contrato.
export const CAMPOS_ORGANIZACAO = [
  { chave: 'razao_social', rotulo: 'Razão social', tipo: 'texto' },
  { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'cnpj' },
  { chave: 'endereco', rotulo: 'Endereço da sede', tipo: 'endereco' },
  { chave: 'representante_nome', rotulo: 'Representante legal', tipo: 'texto' },
  { chave: 'representante_cargo', rotulo: 'Cargo do representante', tipo: 'texto' },
  { chave: 'encarregado_email', rotulo: 'E-mail do encarregado de dados (DPO)', tipo: 'email' },
]

const SESSAO_HORAS = 12
const CONVITE_DIAS = 7
const REDEFINICAO_MIN = 60
const LOGIN_TENTATIVAS = 5
const LOGIN_BLOQUEIO_MIN = 15
const SENHA_MIN = 10

// ── Senha ────────────────────────────────────────────────────────────────────
export function hashSenha(senha) {
  const sal = randomBytes(16)
  const h = scryptSync(String(senha), sal, 32, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$${sal.toString('base64')}$${h.toString('base64')}`
}
export function conferirSenha(senha, guardado) {
  const [alg, n, sal, h] = String(guardado || '').split('$')
  if (alg !== 'scrypt') return false
  const calc = scryptSync(String(senha), Buffer.from(sal, 'base64'), 32, { N: Number(n), r: 8, p: 1 })
  const esperado = Buffer.from(h, 'base64')
  return calc.length === esperado.length && timingSafeEqual(calc, esperado)
}
function validarSenha(senha) {
  const s = String(senha || '')
  if (s.length < SENHA_MIN) throw new ErroNegocio(400, `A senha precisa de pelo menos ${SENHA_MIN} caracteres.`)
  if (/^(.)\1+$/.test(s) || /^(?:0123456789|1234567890|senhasenha)/i.test(s)) throw new ErroNegocio(400, 'Essa senha é fácil demais de adivinhar.')
}

export function criarPlataforma({ repo, notificar, config = {}, agora = () => new Date() }) {
  const baseUrl = config.baseUrl || 'http://localhost:3000'
  const agoraIso = () => agora().toISOString()
  const depois = (ms) => new Date(agora().getTime() + ms).toISOString()
  const tentativasLogin = new Map() // email → { n, ate }

  function auditar(ator, acao, { organizacao_id = null, alvo = null, dados = {} } = {}) {
    repo.inserir('auditoria', {
      em: agoraIso(),
      ator: ator ? { id: ator.id || null, email: ator.email || null, tipo: ator.tipo || 'usuario' } : { tipo: 'sistema' },
      acao, organizacao_id, alvo, dados,
    })
  }

  // ── Organizações ──────────────────────────────────────────────────────────

  function faltandoNoCadastro(dados) {
    return CAMPOS_ORGANIZACAO.filter(c => {
      const v = dados?.[c.chave]
      if (v === undefined || v === null || String(typeof v === 'object' ? JSON.stringify(v) : v).trim() === '') return true
      return !!TIPOS[c.tipo].validar(v, {})
    }).map(c => c.rotulo)
  }

  function inicioDoMes() {
    const d = agora()
    // Mês de Brasília: um contrato das 22h do dia 31 conta no mês dele.
    const br = new Date(d.getTime() - 3 * 3600e3)
    return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3)).toISOString()
  }

  function consumo(orgId) {
    const org = repo.obter('organizacoes', orgId)
    const limite = org?.plano?.contratos_mes ?? null
    const usados = repo.listar('contratos', c => c.organizacao_id === orgId && c.criado_em >= inicioDoMes()).length
    return { plano: org?.plano?.nome || null, usados, limite, restantes: limite == null ? null : Math.max(0, limite - usados) }
  }

  function checarLimite(orgId, quantos = 1) {
    const org = obterOrganizacao(orgId)
    if (org.status !== 'ativa') throw new ErroNegocio(403, 'Organização suspensa. Fale com o suporte da plataforma.')
    const c = consumo(orgId)
    if (c.limite != null && c.usados + quantos > c.limite) {
      throw new ErroNegocio(402, `Limite do plano atingido: ${c.usados} de ${c.limite} contratos este mês${quantos > 1 ? `, e este envio teria ${quantos}` : ''}.`, c)
    }
  }

  function obterOrganizacao(id) {
    const o = repo.obter('organizacoes', id)
    if (!o) throw new ErroNegocio(404, 'Organização não encontrada.')
    return o
  }

  function resumoOrganizacao(o) {
    return {
      id: o.id, nome: o.dados?.razao_social || '(sem nome)', status: o.status, plano: o.plano, criada_em: o.criada_em,
      dados: o.dados, cadastro_incompleto: faltandoNoCadastro(o.dados), consumo: consumo(o.id),
      usuarios: repo.listar('usuarios', u => u.organizacao_id === o.id && u.ativo).length,
    }
  }

  async function criarOrganizacao({ dados = {}, plano = 'teste', admin, id }, ator) {
    if (!dados.razao_social?.trim()) throw new ErroNegocio(400, 'Razão social é obrigatória.')
    if (dados.cnpj && TIPOS.cnpj.validar(dados.cnpj)) throw new ErroNegocio(400, 'CNPJ inválido.')
    if (!PLANOS[plano]) throw new ErroNegocio(400, `Plano deve ser ${Object.keys(PLANOS).join(', ')}.`)
    const o = repo.inserir('organizacoes', {
      ...(id ? { id } : {}),
      dados: limparDados(dados), status: 'ativa', plano: { chave: plano, ...PLANOS[plano] }, criada_em: agoraIso(),
    })
    auditar(ator, 'organizacao.criada', { organizacao_id: o.id, dados: { nome: o.dados.razao_social, plano } })
    let convite = null
    if (admin?.email) convite = await convidar({ organizacaoId: o.id, nome: admin.nome, email: admin.email, papel: 'org_admin' }, ator)
    return { organizacao: resumoOrganizacao(o), convite }
  }

  function atualizarOrganizacao(id, { dados, plano, status, limite_contratos_mes }, ator) {
    const o = obterOrganizacao(id)
    const patch = {}
    if (dados) {
      if (dados.cnpj && TIPOS.cnpj.validar(dados.cnpj)) throw new ErroNegocio(400, 'CNPJ inválido.')
      if (dados.encarregado_email && TIPOS.email.validar(dados.encarregado_email)) throw new ErroNegocio(400, 'E-mail do encarregado inválido.')
      patch.dados = { ...o.dados, ...limparDados(dados) }
    }
    if (plano !== undefined) {
      if (!PLANOS[plano]) throw new ErroNegocio(400, `Plano deve ser ${Object.keys(PLANOS).join(', ')}.`)
      patch.plano = { chave: plano, ...PLANOS[plano] }
    }
    if (limite_contratos_mes !== undefined) {
      const n = limite_contratos_mes === null ? null : Number(limite_contratos_mes)
      if (n !== null && !(Number.isInteger(n) && n >= 0)) throw new ErroNegocio(400, 'Limite deve ser um número inteiro.')
      patch.plano = { ...(patch.plano || o.plano), contratos_mes: n, personalizado: true }
    }
    if (status !== undefined) {
      if (!['ativa', 'suspensa'].includes(status)) throw new ErroNegocio(400, 'Situação deve ser ativa ou suspensa.')
      patch.status = status
    }
    const novo = repo.atualizar('organizacoes', id, patch)
    auditar(ator, 'organizacao.atualizada', { organizacao_id: id, dados: { campos: Object.keys(patch), status: patch.status, plano: patch.plano?.chave } })
    return resumoOrganizacao(novo)
  }

  function listarOrganizacoes() {
    return repo.listar('organizacoes').sort((a, b) => a.criada_em.localeCompare(b.criada_em)).map(resumoOrganizacao)
  }

  // ── Usuários e convites ───────────────────────────────────────────────────

  async function convidar({ organizacaoId = null, nome, email, papel }, ator) {
    const e = String(email || '').trim().toLowerCase()
    if (TIPOS.email.validar(e)) throw new ErroNegocio(400, 'E-mail inválido.')
    if (!nome || String(nome).trim().split(/\s+/).length < 2) throw new ErroNegocio(400, 'Nome completo é obrigatório.')
    if (papel === 'developer' ? organizacaoId : !PAPEIS_DA_ORG.includes(papel)) throw new ErroNegocio(400, 'Papel inválido.')
    if (organizacaoId) obterOrganizacao(organizacaoId)
    const existente = repo.listar('usuarios', u => u.email === e)[0]
    if (existente?.ativo) throw new ErroNegocio(409, 'Já existe um usuário com este e-mail.')

    // Convite anterior para o mesmo e-mail deixa de valer.
    for (const c of repo.listar('convites', c => c.email === e && !c.usado_em)) repo.remover('convites', c.id)
    const { token, hash } = novoToken()
    repo.inserir('convites', {
      token_hash: hash, email: e, nome: String(nome).trim(), papel, organizacao_id: organizacaoId,
      criado_em: agoraIso(), expira_em: depois(CONVITE_DIAS * 864e5), criado_por: ator?.id || null,
    })
    const link = `${baseUrl}/painel/convite/${token}`
    const org = organizacaoId ? repo.obter('organizacoes', organizacaoId) : null
    await notificar({
      para: e, canal: 'email',
      assunto: org ? `Convite para o painel de contratos de ${org.dados.razao_social}` : 'Convite para administrar a plataforma de contratos',
      texto: `Olá, ${String(nome).split(' ')[0]}.\n\nVocê foi convidado(a) como ${PAPEIS[papel].toLowerCase()}${org ? ` de ${org.dados.razao_social}` : ''}.\n\nCrie sua senha por este link (vale ${CONVITE_DIAS} dias):\n${link}`,
      meta: { tipo: 'convite', link, organizacao_id: organizacaoId },
    })
    auditar(ator, 'usuario.convidado', { organizacao_id: organizacaoId, dados: { email: e, papel } })
    return { email: e, papel, expira_em: depois(CONVITE_DIAS * 864e5), link }
  }

  function conviteDe(token) {
    const c = repo.listar('convites', x => !x.tipo && x.token_hash === sha256(String(token || '')))[0]
    if (!c || c.usado_em) throw new ErroNegocio(404, 'Convite inválido ou já usado.')
    if (c.expira_em < agoraIso()) throw new ErroNegocio(410, 'Convite expirado. Peça um novo a quem convidou você.')
    return c
  }

  function verConvite(token) {
    const c = conviteDe(token)
    const org = c.organizacao_id ? repo.obter('organizacoes', c.organizacao_id) : null
    return { nome: c.nome, email: c.email, papel: PAPEIS[c.papel], organizacao: org?.dados.razao_social || null }
  }

  function aceitarConvite(token, senha, ctx = {}) {
    const c = conviteDe(token)
    validarSenha(senha)
    const existente = repo.listar('usuarios', u => u.email === c.email)[0]
    const dados = { nome: c.nome, email: c.email, papel: c.papel, organizacao_id: c.organizacao_id, senha_hash: hashSenha(senha), ativo: true }
    const u = existente ? repo.atualizar('usuarios', existente.id, dados) : repo.inserir('usuarios', { ...dados, criado_em: agoraIso() })
    repo.atualizar('convites', c.id, { usado_em: agoraIso() })
    auditar(u, 'usuario.ativado', { organizacao_id: u.organizacao_id, dados: { ip: ctx.ip || null } })
    return abrirSessao(u, ctx)
  }

  function abrirSessao(u, ctx) {
    const { token, hash } = novoToken()
    repo.inserir('sessoes', { usuario_id: u.id, hash, expira_em: depois(SESSAO_HORAS * 3600e3), criada_em: agoraIso(), ip: ctx.ip || null })
    repo.atualizar('usuarios', u.id, { ultimo_acesso_em: agoraIso() })
    return { sessao: token, usuario: publico(u) }
  }

  function login(email, senha, ctx = {}) {
    const e = String(email || '').trim().toLowerCase()
    const t = tentativasLogin.get(e)
    if (t?.ate && t.ate > agora().getTime()) {
      throw new ErroNegocio(429, `Muitas tentativas. Tente de novo em ${Math.ceil((t.ate - agora().getTime()) / 60e3)} min.`)
    }
    const u = repo.listar('usuarios', x => x.email === e && x.ativo)[0]
    // Mesmo custo com e sem usuário: não dá para descobrir quem tem conta pelo tempo.
    const ok = conferirSenha(senha, u?.senha_hash || hashSenhaFalsa)
    if (!u || !ok) {
      const n = (t?.ate && t.ate <= agora().getTime() ? 0 : t?.n || 0) + 1
      tentativasLogin.set(e, { n, ate: n >= LOGIN_TENTATIVAS ? agora().getTime() + LOGIN_BLOQUEIO_MIN * 60e3 : null })
      auditar({ email: e, tipo: 'anonimo' }, 'login.falhou', { organizacao_id: u?.organizacao_id || null, dados: { ip: ctx.ip || null } })
      throw new ErroNegocio(401, 'E-mail ou senha incorretos.')
    }
    tentativasLogin.delete(e)
    auditar(u, 'login', { organizacao_id: u.organizacao_id, dados: { ip: ctx.ip || null } })
    return abrirSessao(u, ctx)
  }

  function sessaoDe(token) {
    if (!token) return null
    const s = repo.listar('sessoes', x => x.usuario_id && x.hash === sha256(token) && x.expira_em > agoraIso())[0]
    if (!s) return null
    const u = repo.obter('usuarios', s.usuario_id)
    if (!u?.ativo) return null
    const org = u.organizacao_id ? repo.obter('organizacoes', u.organizacao_id) : null
    return { sessao_id: s.id, usuario: u, organizacao: org }
  }

  function sair(token) {
    const s = repo.listar('sessoes', x => x.hash === sha256(String(token || '')))[0]
    if (s) repo.remover('sessoes', s.id)
  }

  function trocarSenha(usuarioId, atual, nova) {
    const u = repo.obter('usuarios', usuarioId)
    if (!conferirSenha(atual, u.senha_hash)) throw new ErroNegocio(400, 'Senha atual incorreta.')
    validarSenha(nova)
    repo.atualizar('usuarios', u.id, { senha_hash: hashSenha(nova) })
    // Trocar a senha derruba as outras sessões.
    for (const s of repo.listar('sessoes', x => x.usuario_id === u.id)) repo.remover('sessoes', s.id)
    auditar(u, 'usuario.senha_trocada', { organizacao_id: u.organizacao_id })
    return abrirSessao(u, {})
  }

  // ── Senha esquecida ──────────────────────────────────────────────────────
  // A resposta é a mesma exista ou não a conta: o link vai por e-mail e vale
  // uma hora, uma vez só. Fica na coleção de convites, marcado como redefinição.
  async function pedirRedefinicao(email, ctx = {}) {
    const e = String(email || '').trim().toLowerCase()
    if (TIPOS.email.validar(e)) throw new ErroNegocio(400, 'E-mail inválido.')
    const u = repo.listar('usuarios', x => x.email === e && x.ativo)[0]
    if (!u) {
      auditar({ email: e, tipo: 'anonimo' }, 'senha.redefinicao_pedida', { dados: { ip: ctx.ip || null, conta: false } })
      return { ok: true }
    }
    for (const c of repo.listar('convites', c => c.tipo === 'redefinicao' && c.usuario_id === u.id && !c.usado_em)) repo.remover('convites', c.id)
    const { token, hash } = novoToken()
    repo.inserir('convites', { tipo: 'redefinicao', token_hash: hash, usuario_id: u.id, email: e, criado_em: agoraIso(), expira_em: depois(REDEFINICAO_MIN * 60e3) })
    const link = `${baseUrl}/painel/redefinir/${token}`
    await notificar({
      para: e, canal: 'email',
      assunto: 'Redefinir a senha do painel de contratos',
      texto: `Olá, ${u.nome.split(' ')[0]}.\n\nAlguém pediu para redefinir a senha da sua conta. Se foi você, use este link (vale ${REDEFINICAO_MIN} minutos e uma vez só):\n${link}\n\nSe não foi você, ignore esta mensagem: a senha continua a mesma.`,
      meta: { tipo: 'redefinicao', link, organizacao_id: u.organizacao_id },
    })
    auditar(u, 'senha.redefinicao_pedida', { organizacao_id: u.organizacao_id, dados: { ip: ctx.ip || null, conta: true } })
    return { ok: true }
  }

  function redefinicaoDe(token) {
    const c = repo.listar('convites', x => x.tipo === 'redefinicao' && x.token_hash === sha256(String(token || '')))[0]
    if (!c || c.usado_em) throw new ErroNegocio(404, 'Este link não vale mais. Peça um novo na tela de entrar.')
    if (c.expira_em < agoraIso()) throw new ErroNegocio(410, 'Este link expirou. Peça um novo na tela de entrar.')
    return c
  }

  function verRedefinicao(token) {
    const c = redefinicaoDe(token)
    return { email: c.email, expira_em: c.expira_em }
  }

  function redefinirSenha(token, senha, ctx = {}) {
    const c = redefinicaoDe(token)
    validarSenha(senha)
    const u = repo.obter('usuarios', c.usuario_id)
    if (!u?.ativo) throw new ErroNegocio(404, 'Esta conta não está mais ativa.')
    repo.atualizar('usuarios', u.id, { senha_hash: hashSenha(senha) })
    for (const s of repo.listar('sessoes', x => x.usuario_id === u.id)) repo.remover('sessoes', s.id)
    repo.atualizar('convites', c.id, { usado_em: agoraIso() })
    tentativasLogin.delete(u.email)
    auditar(u, 'usuario.senha_redefinida', { organizacao_id: u.organizacao_id, dados: { ip: ctx.ip || null } })
    return abrirSessao(u, ctx)
  }

  function listarUsuarios(orgId) {
    const usuarios = repo.listar('usuarios', u => u.organizacao_id === orgId).map(publico)
    const convites = repo.listar('convites', c => c.organizacao_id === orgId && !c.usado_em && c.expira_em > agoraIso())
      .map(c => ({ email: c.email, nome: c.nome, papel: c.papel, papel_rotulo: PAPEIS[c.papel], expira_em: c.expira_em }))
    return { usuarios, convites }
  }

  function alterarUsuario(orgId, usuarioId, { papel, ativo }, ator) {
    const u = repo.obter('usuarios', usuarioId)
    if (!u || u.organizacao_id !== orgId) throw new ErroNegocio(404, 'Usuário não encontrado.')
    if (u.id === ator.id) throw new ErroNegocio(400, 'Você não pode mudar o próprio papel nem se desativar.')
    const patch = {}
    if (papel !== undefined) { if (!PAPEIS_DA_ORG.includes(papel)) throw new ErroNegocio(400, 'Papel inválido.'); patch.papel = papel }
    if (ativo !== undefined) patch.ativo = !!ativo
    // A organização nunca fica sem administrador ativo.
    const adminsDepois = repo.listar('usuarios', x => x.organizacao_id === orgId && x.ativo && x.papel === 'org_admin' && x.id !== u.id).length
    if (u.papel === 'org_admin' && u.ativo && adminsDepois === 0 && (patch.papel && patch.papel !== 'org_admin' || patch.ativo === false)) {
      throw new ErroNegocio(400, 'A organização precisa de pelo menos um administrador ativo.')
    }
    const novo = repo.atualizar('usuarios', u.id, patch)
    if (patch.ativo === false) for (const s of repo.listar('sessoes', x => x.usuario_id === u.id)) repo.remover('sessoes', s.id)
    auditar(ator, 'usuario.alterado', { organizacao_id: orgId, alvo: u.email, dados: patch })
    return publico(novo)
  }

  // ── Chaves de API ─────────────────────────────────────────────────────────

  function criarChave(orgId, { nome, escopo = 'escrita' } = {}, ator, { valor } = {}) {
    obterOrganizacao(orgId)
    if (!['escrita', 'leitura'].includes(escopo)) throw new ErroNegocio(400, 'Escopo deve ser escrita ou leitura.')
    if (!String(nome || '').trim()) throw new ErroNegocio(400, 'Dê um nome à chave (ex.: "Integração ExameQR").')
    const chave = valor || `cs_${randomBytes(24).toString('base64url')}`
    const c = repo.inserir('chaves_api', {
      organizacao_id: orgId, nome: String(nome).trim(), escopo, hash: sha256(chave),
      prefixo: chave.slice(0, 8), criada_em: agoraIso(), criada_por: ator?.id || null, revogada_em: null, usada_em: null,
    })
    auditar(ator, 'chave.criada', { organizacao_id: orgId, alvo: c.prefixo, dados: { nome: c.nome, escopo } })
    return { ...chavePublica(c), chave }
  }

  function autenticarChave(valor) {
    if (!valor) return null
    const c = repo.listar('chaves_api', x => x.hash === sha256(valor) && !x.revogada_em)[0]
    if (!c) return null
    const org = repo.obter('organizacoes', c.organizacao_id)
    if (!org) return null
    // "Usada em" com resolução de 1 min: gravar a cada requisição seria escrever o arquivo todo à toa.
    if (!c.usada_em || agora() - new Date(c.usada_em) > 60e3) repo.atualizar('chaves_api', c.id, { usada_em: agoraIso() })
    return { chave: c, organizacao: org }
  }

  function listarChaves(orgId) {
    return repo.listar('chaves_api', c => c.organizacao_id === orgId).sort((a, b) => b.criada_em.localeCompare(a.criada_em)).map(chavePublica)
  }

  function revogarChave(orgId, id, ator) {
    const c = repo.obter('chaves_api', id)
    if (!c || c.organizacao_id !== orgId) throw new ErroNegocio(404, 'Chave não encontrada.')
    repo.atualizar('chaves_api', id, { revogada_em: agoraIso() })
    auditar(ator, 'chave.revogada', { organizacao_id: orgId, alvo: c.prefixo })
    return chavePublica(repo.obter('chaves_api', id))
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────

  function listarAuditoria({ organizacaoId, limite = 100 } = {}) {
    return repo.listar('auditoria', a => organizacaoId === undefined || a.organizacao_id === organizacaoId)
      .sort((a, b) => b.em.localeCompare(a.em)).slice(0, limite)
  }

  // ── Semente ───────────────────────────────────────────────────────────────

  // Organizações do formato antigo (ORGANIZACOES_ARQUIVO da Fase 2): cria a
  // organização com o mesmo id e uma chave de API com o mesmo valor.
  async function importarOrganizacoes(mapa) {
    for (const [id, o] of Object.entries(mapa || {})) {
      if (repo.obter('organizacoes', id)) continue
      await criarOrganizacao({ id, dados: o.dados, plano: o.plano || 'ilimitado' }, null)
      if (o.api_key) criarChave(id, { nome: 'Chave importada', escopo: 'escrita' }, null, { valor: o.api_key })
    }
  }

  function criarUsuarioDireto({ organizacaoId = null, nome, email, papel, senha }) {
    validarSenha(senha)
    return publico(repo.inserir('usuarios', {
      nome, email: email.toLowerCase(), papel, organizacao_id: organizacaoId, senha_hash: hashSenha(senha), ativo: true, criado_em: agoraIso(),
    }))
  }

  const temDeveloper = () => repo.listar('usuarios', u => u.papel === 'developer' && u.ativo).length > 0

  return {
    PAPEIS, PLANOS, CAMPOS_ORGANIZACAO,
    auditar, listarAuditoria,
    criarOrganizacao, atualizarOrganizacao, listarOrganizacoes, obterOrganizacao, resumoOrganizacao, faltandoNoCadastro, consumo, checarLimite,
    convidar, verConvite, aceitarConvite, login, sessaoDe, sair, trocarSenha, listarUsuarios, alterarUsuario,
    pedirRedefinicao, verRedefinicao, redefinirSenha,
    criarChave, autenticarChave, listarChaves, revogarChave,
    importarOrganizacoes, criarUsuarioDireto, temDeveloper,
  }
}

const hashSenhaFalsa = hashSenha('senha-que-nao-existe-' + Math.random())

function publico(u) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, papel_rotulo: PAPEIS[u.papel], organizacao_id: u.organizacao_id, ativo: u.ativo, ultimo_acesso_em: u.ultimo_acesso_em || null }
}

function chavePublica(c) {
  return { id: c.id, nome: c.nome, escopo: c.escopo, prefixo: c.prefixo, criada_em: c.criada_em, usada_em: c.usada_em, revogada_em: c.revogada_em }
}

function limparDados(d) {
  const out = {}
  for (const c of CAMPOS_ORGANIZACAO) {
    if (d[c.chave] === undefined) continue
    let v = d[c.chave]
    if (c.tipo === 'cnpj' && v) v = TIPOS.cnpj.formatar(v)
    if (c.tipo === 'email' && v) v = String(v).trim().toLowerCase()
    out[c.chave] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

