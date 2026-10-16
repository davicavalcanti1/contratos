// Serviço de assinatura (Fase 2). Toda regra de negócio da assinatura mora
// aqui; o HTTP só traduz. Ciclo em docs/DOMINIO.md §4, evidências em
// docs/VALIDADE-JURIDICA.md §3.
//
// Invariantes que este arquivo garante:
//   - o texto e o PDF original são gravados na geração e nunca mais mudam;
//   - só este serviço declara assinado/recusado/expirado — e só pelo fluxo;
//   - ninguém assina sem: código validado, ciência em TODA cláusula crítica,
//     leitura até o fim, nome digitado conferindo e "concordo" marcado;
//   - cada passo vira evento na trilha encadeada.

import QRCode from 'qrcode'
import { acharModelo } from '../biblioteca.js'
import { montarContrato } from '../motor/montar.js'
import { gerarPdf } from '../motor/pdf.js'
import { TIPOS } from '../motor/tipos.js'
import { criarTrilha } from './trilha.js'
import {
  hashOtp, iguais, mascararCpf, mascararEmail, mascararNome, normalizarCodigo,
  normalizarNome, novoCodigoVerificacao, novoOtp, novoToken, sha256,
} from './segredos.js'

export class ErroNegocio extends Error {
  constructor(status, mensagem, detalhes = undefined) {
    super(mensagem)
    this.status = status
    this.detalhes = detalhes
  }
}

export const PAPEIS = {
  parte: 'Parte',
  representante: 'Representante legal',
  testemunha: 'Testemunha',
  interveniente: 'Interveniente',
}

const EM_ASSINATURA = new Set(['enviado', 'parcialmente_assinado'])

// Domínios de e-mail que não são caixa de ninguém (lição do ExameQR: usuário
// criado por username nascia com <user>@exameqr.app e o link ia para o vazio).
const DOMINIOS_SINTETICOS = [/@exameqr\.app$/i, /@example\.(com|org)$/i, /@localhost$/i]

export const CONFIG_PADRAO = {
  baseUrl: 'http://localhost:3000',
  prazoDias: 30,
  otpMinutos: 10,
  otpTentativas: 5,
  otpIntervaloSeg: 60,
  sessaoHoras: 2,
}

export function criarServico({ repo, biblioteca, notificar, config = {}, agora = () => new Date() }) {
  const cfg = { ...CONFIG_PADRAO, ...config }
  const trilha = criarTrilha(repo, agora)
  const agoraIso = () => agora().toISOString()
  const depois = (ms) => new Date(agora().getTime() + ms).toISOString()

  // ── Organização: gerar, enviar, consultar ─────────────────────────────────

  async function gerar({ organizacaoId, organizacao, modelo: chave, dados }) {
    const modelo = acharModelo(biblioteca, chave)
    const r = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: { ...dados, organizacao }, agora: agora() })
    if (!r.ok) throw new ErroNegocio(422, 'O contrato tem lacunas e não pode ser gerado.', { faltando: r.faltando, invalidos: r.invalidos })

    const { buffer, sha256: pdfSha } = await gerarPdf(r.contrato)
    const c = repo.inserir('contratos', {
      organizacao_id: organizacaoId,
      organizacao_nome: organizacao.razao_social,
      status: 'gerado',
      titulo: r.contrato.titulo,
      modelo: r.contrato.modelo,
      snapshot: r.contrato,
      conteudo_sha256: r.contrato.conteudo_sha256,
      criado_em: agoraIso(),
    })
    const arquivo = repo.salvarArquivo(`${c.id}-original.pdf`, buffer)
    repo.atualizar('contratos', c.id, { pdf_original: { arquivo, sha256: pdfSha } })
    trilha.registrar(c.id, 'contrato.gerado', {
      ator: `organizacao:${organizacaoId}`,
      dados: { modelo: r.contrato.modelo, conteudo_sha256: r.contrato.conteudo_sha256, pdf_original_sha256: pdfSha },
    })
    return resumoContrato(repo.obter('contratos', c.id))
  }

  function contratoDaOrg(id, organizacaoId) {
    const c = repo.obter('contratos', id)
    if (!c || c.organizacao_id !== organizacaoId) throw new ErroNegocio(404, 'Contrato não encontrado.')
    return checarExpiracao(c)
  }

  async function enviar(id, organizacaoId, { signatarios, ordem = 'paralela', prazo_dias } = {}) {
    const c = contratoDaOrg(id, organizacaoId)
    if (c.status !== 'gerado') throw new ErroNegocio(409, `Contrato está "${c.status}" — só se envia um contrato recém-gerado.`)
    if (!['paralela', 'sequencial'].includes(ordem)) throw new ErroNegocio(400, 'ordem deve ser "paralela" ou "sequencial".')
    validarSignatarios(signatarios)

    signatarios.forEach((s, i) => repo.inserir('signatarios', {
      contrato_id: c.id,
      ordem: i + 1,
      nome: s.nome.trim(),
      email: s.email.trim().toLowerCase(),
      cpf: s.cpf ? TIPOS.cpf.formatar(s.cpf) : null,
      papel: s.papel || 'parte',
      canal: 'email',
      status: 'aguardando',
      ciencias: {},
    }))
    const dias = Number(prazo_dias) > 0 ? Number(prazo_dias) : cfg.prazoDias
    repo.atualizar('contratos', c.id, { status: 'enviado', ordem, enviado_em: agoraIso(), expira_em: depois(dias * 864e5) })

    const lista = signatariosDe(c.id)
    trilha.registrar(c.id, 'contrato.enviado', {
      ator: `organizacao:${organizacaoId}`,
      dados: { ordem, expira_em: repo.obter('contratos', c.id).expira_em, signatarios: lista.map(s => ({ id: s.id, nome: s.nome, email: s.email, papel: s.papel, ordem: s.ordem })) },
    })

    const aNotificar = ordem === 'paralela' ? lista : lista.slice(0, 1)
    const links = []
    for (const s of aNotificar) links.push({ signatario_id: s.id, nome: s.nome, link: await notificarSignatario(c.id, s) })
    return { contrato: resumoContrato(repo.obter('contratos', c.id)), links }
  }

  // Novo token a cada envio: reenviar INVALIDA o link anterior.
  async function notificarSignatario(contratoId, s) {
    const c = repo.obter('contratos', contratoId)
    const { token, hash } = novoToken()
    repo.atualizar('signatarios', s.id, { token_hash: hash, status: s.status === 'aguardando' ? 'notificado' : s.status, notificado_em: agoraIso() })
    const link = `${cfg.baseUrl}/assinar/${token}`
    await notificar({
      para: s.email,
      canal: s.canal,
      assunto: `${c.organizacao_nome} enviou um contrato para você assinar`,
      texto: `Olá, ${s.nome.split(' ')[0]}.\n\n${c.organizacao_nome} enviou o "${c.titulo}" para a sua assinatura.\n\nAbra o link para ler e assinar:\n${link}\n\nPor segurança, pediremos um código enviado a este e-mail. O link vale até ${dataCurta(c.expira_em)}.`,
      meta: { tipo: 'link', contrato_id: contratoId, signatario_id: s.id, link },
    })
    trilha.registrar(contratoId, 'link.enviado', { dados: { signatario_id: s.id, canal: s.canal, destino: mascararEmail(s.email) } })
    return link
  }

  async function reenviar(id, organizacaoId, signatarioId) {
    const c = contratoDaOrg(id, organizacaoId)
    if (!EM_ASSINATURA.has(c.status)) throw new ErroNegocio(409, `Contrato está "${c.status}".`)
    const s = repo.obter('signatarios', signatarioId)
    if (!s || s.contrato_id !== c.id) throw new ErroNegocio(404, 'Signatário não encontrado.')
    if (['assinado', 'recusado'].includes(s.status)) throw new ErroNegocio(409, 'Este signatário já concluiu.')
    if (c.ordem === 'sequencial' && !vezDe(c, s)) throw new ErroNegocio(409, 'Ainda não é a vez deste signatário.')
    return { link: await notificarSignatario(c.id, s) }
  }

  function cancelar(id, organizacaoId, motivo) {
    const c = contratoDaOrg(id, organizacaoId)
    if (!['gerado', ...EM_ASSINATURA].includes(c.status)) throw new ErroNegocio(409, `Contrato "${c.status}" não pode ser cancelado.`)
    repo.atualizar('contratos', c.id, { status: 'cancelado', cancelado_em: agoraIso() })
    trilha.registrar(c.id, 'contrato.cancelado', { ator: `organizacao:${organizacaoId}`, dados: { motivo: motivo || null } })
    return resumoContrato(repo.obter('contratos', c.id))
  }

  function consultar(id, organizacaoId) {
    const c = contratoDaOrg(id, organizacaoId)
    return {
      ...resumoContrato(c),
      signatarios: signatariosDe(c.id).map(s => ({
        id: s.id, ordem: s.ordem, nome: s.nome, email: s.email, papel: s.papel, status: s.status,
        assinado_em: s.assinado_em || null, recusado_em: s.recusado_em || null, recusa_motivo: s.recusa_motivo || null,
      })),
      eventos: trilha.listar(c.id).map(e => ({ seq: e.seq, tipo: e.tipo, em: e.em })),
    }
  }

  function arquivo(id, organizacaoId, qual) {
    const c = contratoDaOrg(id, organizacaoId)
    return lerPdf(c, qual)
  }

  function dossie(id, organizacaoId) {
    const c = contratoDaOrg(id, organizacaoId)
    const eventos = trilha.listar(c.id).map(({ id: _id, ...e }) => e)
    return {
      versao_dossie: 1,
      emitido_em: agoraIso(),
      contrato: {
        id: c.id, titulo: c.titulo, status: c.status, modelo: c.modelo, organizacao: c.organizacao_nome,
        criado_em: c.criado_em, enviado_em: c.enviado_em || null, assinado_em: c.assinado_em || null,
        codigo_verificacao: c.codigo_verificacao || null,
      },
      integridade: {
        conteudo_sha256: c.conteudo_sha256,
        pdf_original_sha256: c.pdf_original?.sha256 || null,
        pdf_final_sha256: c.pdf_final?.sha256 || null,
        trilha: trilha.verificar(c.id),
        carimbo_do_tempo: null, // Fase 6: ACT ICP-Brasil sobre o hash final
      },
      signatarios: signatariosDe(c.id).map(s => ({
        id: s.id, ordem: s.ordem, nome: s.nome, email: s.email, cpf: s.cpf, papel: s.papel, canal: s.canal,
        status: s.status, identificado_em: s.identificado_em || null, leitura_completa_em: s.leitura_completa_em || null,
        ciencias: s.ciencias, assinado_em: s.assinado_em || null, nome_digitado: s.nome_digitado || null,
        evidencias: s.evidencias || null, recusado_em: s.recusado_em || null, recusa_motivo: s.recusa_motivo || null,
      })),
      eventos,
      snapshot: c.snapshot,
    }
  }

  // ── Signatário: tudo entra pelo token do link ─────────────────────────────

  function porToken(token) {
    const hash = sha256(String(token || ''))
    const s = repo.listar('signatarios', x => x.token_hash === hash)[0]
    if (!s) throw new ErroNegocio(404, 'Link inválido ou substituído por um mais novo. Use o último link recebido.')
    const c = checarExpiracao(repo.obter('contratos', s.contrato_id))
    return { s, c }
  }

  function comSessao(token, sessao) {
    const { s, c } = porToken(token)
    const h = sha256(String(sessao || ''))
    const ok = repo.listar('sessoes', x => x.signatario_id === s.id && x.hash === h && x.expira_em > agoraIso())[0]
    if (!ok) throw new ErroNegocio(401, 'Sessão expirada. Confirme o código de novo.')
    return { s, c }
  }

  function exigirEmAssinatura(c, s) {
    if (!EM_ASSINATURA.has(c.status)) throw new ErroNegocio(409, mensagemStatus(c.status))
    if (s.status === 'assinado') throw new ErroNegocio(409, 'Você já assinou este contrato.')
    if (s.status === 'recusado') throw new ErroNegocio(409, 'Você recusou este contrato.')
  }

  function abrir(token, ctx = {}) {
    const { s, c } = porToken(token)
    trilha.registrar(c.id, 'link.aberto', { ator: `signatario:${s.id}`, ...evidencia(ctx) })
    return {
      organizacao: c.organizacao_nome,
      titulo: c.titulo,
      contrato_status: c.status,
      expira_em: c.expira_em,
      signatario: { nome: s.nome, email: mascararEmail(s.email), papel: PAPEIS[s.papel], status: s.status },
    }
  }

  async function solicitarCodigo(token, ctx = {}) {
    const { s, c } = porToken(token)
    if (c.status !== 'assinado') exigirEmAssinatura(c, s)
    const desde = s.otp?.enviado_em ? (agora() - new Date(s.otp.enviado_em)) / 1000 : Infinity
    if (desde < cfg.otpIntervaloSeg) {
      throw new ErroNegocio(429, `Aguarde ${Math.ceil(cfg.otpIntervaloSeg - desde)}s para pedir outro código.`, { aguardar_s: Math.ceil(cfg.otpIntervaloSeg - desde) })
    }
    const { codigo, hash } = novoOtp(s.id)
    const expira_em = depois(cfg.otpMinutos * 60e3)
    repo.atualizar('signatarios', s.id, { otp: { hash, expira_em, tentativas: 0, enviado_em: agoraIso() } })
    await notificar({
      para: s.email,
      canal: s.canal,
      assunto: `Seu código para assinar: ${codigo}`,
      texto: `Seu código é ${codigo}. Ele vale ${cfg.otpMinutos} minutos.\n\nSe não foi você quem pediu, ignore esta mensagem — sem o código ninguém assina em seu nome.`,
      meta: { tipo: 'codigo', contrato_id: c.id, signatario_id: s.id, codigo },
    })
    trilha.registrar(c.id, 'otp.enviado', { ator: `signatario:${s.id}`, dados: { canal: s.canal, destino: mascararEmail(s.email) }, ...evidencia(ctx) })
    return { enviado_para: mascararEmail(s.email), expira_em, reenviar_em_s: cfg.otpIntervaloSeg }
  }

  function validarCodigo(token, codigo, ctx = {}) {
    const { s, c } = porToken(token)
    if (c.status !== 'assinado') exigirEmAssinatura(c, s)
    const otp = s.otp
    if (!otp) throw new ErroNegocio(400, 'Peça um código primeiro.')
    if (otp.expira_em < agoraIso()) throw new ErroNegocio(400, 'O código expirou. Peça outro.')
    if (otp.tentativas >= cfg.otpTentativas) throw new ErroNegocio(429, 'Muitas tentativas erradas. Peça um código novo.')

    if (!iguais(hashOtp(s.id, codigo), otp.hash)) {
      const tentativas = otp.tentativas + 1
      repo.atualizar('signatarios', s.id, { otp: { ...otp, tentativas } })
      trilha.registrar(c.id, 'otp.falhou', { ator: `signatario:${s.id}`, dados: { tentativa: tentativas }, ...evidencia(ctx) })
      const restam = cfg.otpTentativas - tentativas
      throw new ErroNegocio(400, restam > 0 ? `Código incorreto. Restam ${restam} tentativa(s).` : 'Código incorreto. Peça um código novo.', { restam })
    }

    const patch = { otp: null }
    if (!s.identificado_em) { patch.identificado_em = agoraIso(); patch.status = s.status === 'notificado' ? 'identificado' : s.status }
    repo.atualizar('signatarios', s.id, patch)
    const { token: sessao, hash } = novoToken()
    const expira_em = depois(cfg.sessaoHoras * 3600e3)
    repo.inserir('sessoes', { signatario_id: s.id, hash, expira_em, criada_em: agoraIso() })
    trilha.registrar(c.id, 'otp.validado', { ator: `signatario:${s.id}`, dados: { canal: s.canal }, ...evidencia(ctx) })
    return { sessao, expira_em }
  }

  // O que a tela de leitura precisa: o texto, a bula, o que já foi confirmado.
  function conteudo(token, sessao) {
    const { s, c } = comSessao(token, sessao)
    const todos = signatariosDe(c.id)
    return {
      organizacao: c.organizacao_nome,
      titulo: c.titulo,
      contrato_status: c.status,
      expira_em: c.expira_em,
      preambulo: c.snapshot.preambulo,
      fecho: c.snapshot.fecho,
      clausulas: c.snapshot.clausulas.map(cl => ({
        chave: cl.chave, numero: cl.numero, titulo: cl.titulo, paragrafos: cl.paragrafos,
        resumo: cl.resumo, critica: cl.critica, ciente_em: s.ciencias?.[cl.chave]?.em || null,
      })),
      signatario: {
        nome: s.nome, papel: PAPEIS[s.papel], status: s.status,
        leitura_completa_em: s.leitura_completa_em || null, assinado_em: s.assinado_em || null,
        sua_vez: c.ordem !== 'sequencial' || vezDe(c, s),
      },
      outros: todos.filter(x => x.id !== s.id).map(x => ({ nome: mascararNome(x.nome), papel: PAPEIS[x.papel], status: x.status })),
      codigo_verificacao: c.codigo_verificacao || null,
      conteudo_sha256: c.conteudo_sha256,
    }
  }

  function darCiencia(token, sessao, chave, { tempo_leitura_ms } = {}, ctx = {}) {
    const { s, c } = comSessao(token, sessao)
    exigirEmAssinatura(c, s)
    const cl = c.snapshot.clausulas.find(x => x.chave === chave)
    if (!cl) throw new ErroNegocio(404, 'Cláusula não está neste contrato.')
    if (!cl.critica) throw new ErroNegocio(400, 'Só as cláusulas em destaque pedem ciência individual.')
    if (s.ciencias?.[chave]) return { ciente_em: s.ciencias[chave].em }
    const em = agoraIso()
    const tempo = Number.isFinite(Number(tempo_leitura_ms)) ? Math.max(0, Math.round(Number(tempo_leitura_ms))) : null
    repo.atualizar('signatarios', s.id, { ciencias: { ...s.ciencias, [chave]: { em, tempo_leitura_ms: tempo } } })
    trilha.registrar(c.id, 'clausula.ciencia', {
      ator: `signatario:${s.id}`,
      // tempo de leitura é INFORMADO PELO NAVEGADOR — evidência auxiliar, não prova
      dados: { clausula: chave, numero: cl.numero, versao: cl.versao, resumo_exibido: cl.resumo, tempo_leitura_ms_informado: tempo },
      ...evidencia(ctx),
    })
    return { ciente_em: em }
  }

  function registrarLeitura(token, sessao, { tempos } = {}, ctx = {}) {
    const { s, c } = comSessao(token, sessao)
    exigirEmAssinatura(c, s)
    if (s.leitura_completa_em) return { leitura_completa_em: s.leitura_completa_em }
    const em = agoraIso()
    repo.atualizar('signatarios', s.id, { leitura_completa_em: em })
    trilha.registrar(c.id, 'documento.lido_ate_o_fim', { ator: `signatario:${s.id}`, dados: { tempos_por_clausula_ms_informado: limparTempos(tempos) }, ...evidencia(ctx) })
    return { leitura_completa_em: em }
  }

  async function assinar(token, sessao, { nome_digitado, concordo, geo } = {}, ctx = {}) {
    const { s, c } = comSessao(token, sessao)
    exigirEmAssinatura(c, s)
    if (c.ordem === 'sequencial' && !vezDe(c, s)) throw new ErroNegocio(409, 'Ainda não é a sua vez: outra pessoa assina antes.')

    const faltam = c.snapshot.clausulas.filter(cl => cl.critica && !s.ciencias?.[cl.chave]).map(cl => cl.numero)
    if (faltam.length) throw new ErroNegocio(409, `Confirme a leitura das cláusulas em destaque: ${faltam.join(', ')}.`, { clausulas: faltam })
    if (!s.leitura_completa_em) throw new ErroNegocio(409, 'Leia o contrato até o fim antes de assinar.')
    if (concordo !== true) throw new ErroNegocio(400, 'Marque que você leu e concorda com o contrato.')
    if (normalizarNome(nome_digitado) !== normalizarNome(s.nome)) {
      throw new ErroNegocio(400, `Digite seu nome completo como está no contrato: ${s.nome}.`)
    }

    const em = agoraIso()
    const geoLimpa = limparGeo(geo)
    repo.atualizar('signatarios', s.id, {
      status: 'assinado', assinado_em: em, nome_digitado: String(nome_digitado).trim(),
      evidencias: { ip: ctx.ip || null, user_agent: ctx.user_agent || null, geo: geoLimpa },
    })
    trilha.registrar(c.id, 'assinatura.aceita', {
      ator: `signatario:${s.id}`,
      dados: { metodo: `otp_${s.canal}`, nome_digitado: String(nome_digitado).trim(), ciencias: Object.keys(s.ciencias || {}).length, geo: geoLimpa },
      ...evidencia(ctx),
    })

    const todos = signatariosDe(c.id)
    if (todos.every(x => x.status === 'assinado')) {
      await selar(c.id)
    } else {
      repo.atualizar('contratos', c.id, { status: 'parcialmente_assinado' })
      if (c.ordem === 'sequencial') {
        const proximo = todos.find(x => x.ordem === s.ordem + 1)
        if (proximo?.status === 'aguardando') await notificarSignatario(c.id, proximo)
      }
    }
    return { assinado_em: em, contrato_status: repo.obter('contratos', c.id).status }
  }

  function recusar(token, sessao, { motivo } = {}, ctx = {}) {
    const { s, c } = comSessao(token, sessao)
    exigirEmAssinatura(c, s)
    const m = String(motivo || '').trim()
    if (m.length < 3) throw new ErroNegocio(400, 'Conte em poucas palavras por que está recusando.')
    const em = agoraIso()
    repo.atualizar('signatarios', s.id, { status: 'recusado', recusado_em: em, recusa_motivo: m })
    repo.atualizar('contratos', c.id, { status: 'recusado', recusado_em: em })
    trilha.registrar(c.id, 'assinatura.recusada', { ator: `signatario:${s.id}`, dados: { motivo: m }, ...evidencia(ctx) })
    return { recusado_em: em }
  }

  function arquivoDoSignatario(token, sessao, qual) {
    const { c } = comSessao(token, sessao)
    return lerPdf(c, qual)
  }

  // ── Selo ──────────────────────────────────────────────────────────────────

  async function selar(contratoId) {
    const c = repo.obter('contratos', contratoId)
    if (c.codigo_verificacao) return c // idempotente: dois "últimos" não selam duas vezes

    let codigo
    do codigo = novoCodigoVerificacao()
    while (repo.listar('contratos', x => x.codigo_verificacao === codigo).length)
    const url = `${cfg.baseUrl}/v/${codigo}`
    const qrPng = await QRCode.toBuffer(url, { margin: 0, width: 240, errorCorrectionLevel: 'M' })

    const signatarios = signatariosDe(c.id).map(s => ({
      nome: s.nome, email: s.email, cpf: s.cpf, papel_rotulo: PAPEIS[s.papel], canal: s.canal,
      assinado_em: s.assinado_em, identificado_em: s.identificado_em, ip: s.evidencias?.ip,
      ciencias: Object.keys(s.ciencias || {}).length, nome_digitado: s.nome_digitado,
    }))
    const { buffer, sha256: pdfSha } = await gerarPdf(c.snapshot, {
      selo: { codigo, url, qrPng },
      assinaturas: { signatarios, pdf_original_sha256: c.pdf_original.sha256 },
    })
    const arquivo = repo.salvarArquivo(`${c.id}-final.pdf`, buffer)
    const em = agoraIso()
    repo.atualizar('contratos', c.id, { status: 'assinado', assinado_em: em, codigo_verificacao: codigo, pdf_final: { arquivo, sha256: pdfSha } })
    const verif = trilha.verificar(c.id)
    trilha.registrar(c.id, 'documento.selado', { dados: { codigo_verificacao: codigo, pdf_final_sha256: pdfSha, trilha_hash_ate_aqui: verif.hash_final } })

    for (const s of signatariosDe(c.id)) {
      await notificar({
        para: s.email,
        canal: s.canal,
        assunto: `Contrato assinado por todos: ${c.titulo}`,
        texto: `Todas as partes assinaram o "${c.titulo}".\n\nCódigo de verificação: ${codigo}\nConfira a autenticidade: ${url}\n\nPara baixar a sua via, abra de novo o link de assinatura que você recebeu.`,
        meta: { tipo: 'concluido', contrato_id: c.id, signatario_id: s.id, codigo },
      })
    }
    return repo.obter('contratos', c.id)
  }

  // ── Verificação pública (página do QR) ────────────────────────────────────

  function verificar(codigoBruto) {
    const codigo = normalizarCodigo(codigoBruto)
    const c = repo.listar('contratos', x => x.codigo_verificacao === codigo)[0]
    if (!c) return null
    const verif = trilha.verificar(c.id)
    return {
      codigo,
      status: c.status,
      titulo: c.titulo,
      organizacao: c.organizacao_nome,
      modelo: c.modelo,
      criado_em: c.criado_em,
      assinado_em: c.assinado_em,
      signatarios: signatariosDe(c.id).map(s => ({
        nome: mascararNome(s.nome), cpf: mascararCpf(s.cpf), papel: PAPEIS[s.papel], assinado_em: s.assinado_em,
      })),
      integridade: {
        conteudo_sha256: c.conteudo_sha256,
        pdf_original_sha256: c.pdf_original.sha256,
        pdf_final_sha256: c.pdf_final.sha256,
        trilha_integra: verif.integra,
        eventos: verif.eventos ?? null,
      },
    }
  }

  function conferirHash(codigoBruto, hash) {
    const v = verificar(codigoBruto)
    if (!v) return null
    const h = String(hash || '').toLowerCase()
    const confere = h === v.integridade.pdf_final_sha256 ? 'final' : h === v.integridade.pdf_original_sha256 ? 'original' : null
    return { confere }
  }

  // ── Auxiliares ────────────────────────────────────────────────────────────

  function checarExpiracao(c) {
    if (c && EM_ASSINATURA.has(c.status) && c.expira_em && c.expira_em < agoraIso()) {
      repo.atualizar('contratos', c.id, { status: 'expirado' })
      trilha.registrar(c.id, 'contrato.expirado', { dados: { expira_em: c.expira_em } })
      return repo.obter('contratos', c.id)
    }
    return c
  }

  function signatariosDe(contratoId) {
    return repo.listar('signatarios', s => s.contrato_id === contratoId).sort((a, b) => a.ordem - b.ordem)
  }

  function vezDe(c, s) {
    return signatariosDe(c.id).filter(x => x.ordem < s.ordem).every(x => x.status === 'assinado')
  }

  function lerPdf(c, qual) {
    const ref = qual === 'final' ? c.pdf_final : c.pdf_original
    if (!ref) throw new ErroNegocio(404, qual === 'final' ? 'O PDF final só existe depois que todos assinam.' : 'PDF não encontrado.')
    return { buffer: repo.lerArquivo(ref.arquivo), sha256: ref.sha256, nome: `${slug(c.titulo)}-${qual === 'final' ? 'assinado' : 'original'}.pdf` }
  }

  function validarSignatarios(lista) {
    if (!Array.isArray(lista) || !lista.length) throw new ErroNegocio(400, 'Informe ao menos um signatário.')
    const emails = new Set()
    lista.forEach((s, i) => {
      const onde = `signatário ${i + 1}`
      if (!s?.nome || String(s.nome).trim().split(/\s+/).length < 2) throw new ErroNegocio(400, `${onde}: nome completo é obrigatório.`)
      if (TIPOS.email.validar(s.email || '')) throw new ErroNegocio(400, `${onde}: e-mail inválido.`)
      if (DOMINIOS_SINTETICOS.some(r => r.test(s.email))) throw new ErroNegocio(400, `${onde}: "${s.email}" não é uma caixa de e-mail real.`)
      if (s.cpf && TIPOS.cpf.validar(s.cpf)) throw new ErroNegocio(400, `${onde}: CPF inválido.`)
      if (s.papel && !PAPEIS[s.papel]) throw new ErroNegocio(400, `${onde}: papel deve ser ${Object.keys(PAPEIS).join(', ')}.`)
      const e = String(s.email).trim().toLowerCase()
      if (emails.has(e)) throw new ErroNegocio(400, `${onde}: e-mail repetido — cada signatário precisa do próprio.`)
      emails.add(e)
    })
  }

  return {
    config: cfg, trilha,
    gerar, enviar, reenviar, cancelar, consultar, arquivo, dossie,
    abrir, solicitarCodigo, validarCodigo, conteudo, darCiencia, registrarLeitura, assinar, recusar, arquivoDoSignatario,
    verificar, conferirHash,
  }
}

function evidencia(ctx) {
  return { ip: ctx.ip || null, user_agent: ctx.user_agent ? String(ctx.user_agent).slice(0, 400) : null }
}

function limparGeo(geo) {
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lng))) return null
  return { lat: Number(geo.lat), lng: Number(geo.lng), precisao_m: Number.isFinite(Number(geo.precisao_m)) ? Math.round(Number(geo.precisao_m)) : null }
}

function limparTempos(t) {
  if (!t || typeof t !== 'object') return null
  return Object.fromEntries(Object.entries(t).slice(0, 200).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [String(k).slice(0, 60), Math.round(Number(v))]))
}

function mensagemStatus(status) {
  return {
    gerado: 'Este contrato ainda não foi enviado para assinatura.',
    assinado: 'Este contrato já foi assinado por todos.',
    recusado: 'Este contrato foi recusado e não pode mais ser assinado.',
    expirado: 'O prazo para assinar este contrato terminou.',
    cancelado: 'Este contrato foi cancelado por quem o enviou.',
  }[status] || `Contrato "${status}".`
}

function resumoContrato(c) {
  return {
    id: c.id, status: c.status, titulo: c.titulo, modelo: c.modelo, organizacao: c.organizacao_nome,
    conteudo_sha256: c.conteudo_sha256, pdf_original_sha256: c.pdf_original?.sha256 || null,
    pdf_final_sha256: c.pdf_final?.sha256 || null, codigo_verificacao: c.codigo_verificacao || null,
    ordem: c.ordem || null, criado_em: c.criado_em, enviado_em: c.enviado_em || null,
    expira_em: c.expira_em || null, assinado_em: c.assinado_em || null,
  }
}

const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
