// Demonstração real pelo site: o visitante deixa nome e e-mail, recebe um
// contrato de exemplo DE VERDADE (uma clínica fictícia contratando a pessoa
// para laudos, com dados fictícios além do nome e do e-mail dela), assina
// com a bula e vê o selo. Quem pediu vira um interessado: entra na lista da
// plataforma e o developer é avisado por e-mail. É o site vendendo sozinho.
//
// Abuso: um pedido por e-mail a cada 24 h (aqui), poucos por IP por hora (no
// HTTP), campo-armadilha para robô, e o contrato expira em 2 dias.

import { ErroNegocio } from '../assinatura/servico.js'
import { mascararEmail } from '../assinatura/segredos.js'
import { TIPOS } from '../motor/tipos.js'

export const ORG_DEMO = 'demonstracao'
const DADOS_ORG = {
  razao_social: 'Clínica Exemplo Diagnóstico por Imagem Ltda.',
  cnpj: '11.222.333/0001-81',
  endereco: 'Av. Epitácio Pessoa, nº 1000, Tambauzinho, João Pessoa/PB, CEP 58040-000',
  representante_nome: 'Maria Exemplo',
  representante_cargo: 'diretora',
  encarregado_email: 'privacidade@clinicaexemplo.com.br',
}
const PRAZO_DIAS = 2

export function criarDemonstracao({ repo, servico, plataforma, marca = null, notificar, config = {}, agora = () => new Date() }) {
  const baseUrl = (config.baseUrl || 'http://localhost:3000').replace(/\/$/, '')
  const dev = !!config.dev

  async function garantirOrganizacao() {
    if (repo.obter('organizacoes', ORG_DEMO)) return false
    await plataforma.criarOrganizacao({ id: ORG_DEMO, dados: DADOS_ORG, plano: 'ilimitado' }, null)
    if (marca) marca.definir(ORG_DEMO, { nome: 'Clínica Exemplo' }, null)
    return true
  }

  // O contrato que a pessoa recebe: ela como contratada, o resto fictício.
  function dadosDoContrato(nome, email) {
    const hoje = agora()
    const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
    return {
      contratado: {
        tipo: 'pf', nome, email,
        cpf: '529.982.247-25', estado_civil: 'solteiro(a)', profissao: 'médico(a) radiologista',
        endereco: 'Rua de Exemplo, nº 100, Centro, João Pessoa/PB, CEP 58010-000',
      },
      contrato: {
        objeto: 'elaboração de laudos de exames de tomografia e ressonância magnética, à distância, com volume estimado de 400 laudos por mês (contrato de demonstração, com dados fictícios)',
        valor: '9.800,00', forma_pagamento: 'mensal', prazo_tipo: 'determinado', data_inicio: inicio, duracao_meses: 12,
        foro_comarca: 'João Pessoa/PB',
      },
    }
  }

  async function pedir({ nome, email, empresa, telefone, site } = {}, ctx = {}) {
    // Campo-armadilha: só robô preenche. Finge que deu certo e não faz nada.
    if (site) return { ok: true, enviado_para: mascararEmail(String(email || 'x@x.xx')) }
    const n = String(nome || '').trim().replace(/\s+/g, ' ')
    if (n.split(' ').length < 2 || n.length > 80) throw new ErroNegocio(400, 'Diga seu nome completo: é ele que você vai digitar na hora de assinar.')
    const e = String(email || '').trim().toLowerCase()
    if (TIPOS.email.validar(e)) throw new ErroNegocio(400, 'E-mail inválido.')
    const ha24h = agora().getTime() - 864e5
    if (repo.listar('interessados', i => i.email === e && new Date(i.em).getTime() > ha24h).length) {
      throw new ErroNegocio(429, 'Já enviamos um contrato de exemplo para este e-mail hoje. Procure na caixa de entrada (e no spam): o link vale 2 dias.')
    }
    await garantirOrganizacao()
    const org = repo.obter('organizacoes', ORG_DEMO)
    const c = await servico.gerar({ organizacaoId: ORG_DEMO, organizacao: org.dados, modelo: 'prestacao_servicos', dados: dadosDoContrato(n, e), referencia: `site:${e}` })
    const { links } = await servico.enviar(c.id, ORG_DEMO, { signatarios: [{ nome: n, email: e, papel: 'parte' }], prazo_dias: PRAZO_DIAS })
    const i = repo.inserir('interessados', {
      nome: n, email: e,
      empresa: String(empresa || '').trim().slice(0, 120) || null,
      telefone: String(telefone || '').trim().slice(0, 40) || null,
      contrato_id: c.id, origem: 'site', em: agora().toISOString(),
      ip: ctx.ip || null, user_agent: ctx.user_agent ? String(ctx.user_agent).slice(0, 400) : null,
    })
    await avisarDevelopers(i)
    return { ok: true, enviado_para: mascararEmail(e), expira_em_dias: PRAZO_DIAS, ...(dev ? { link: links[0]?.link || null } : {}) }
  }

  async function avisarDevelopers(i) {
    const devs = repo.listar('usuarios', u => u.papel === 'developer' && u.ativo && u.email)
    for (const u of devs) {
      try {
        await notificar({
          para: u.email, canal: 'email',
          assunto: `Interessado pelo site: ${i.nome}${i.empresa ? ` (${i.empresa})` : ''}`,
          texto: `${i.nome} pediu o contrato de exemplo pelo site.\n\nE-mail: ${i.email}\nEmpresa: ${i.empresa || '—'}\nWhatsApp: ${i.telefone || '—'}\n\nO contrato foi enviado e o link vale ${PRAZO_DIAS} dias. Acompanhe se a pessoa abriu e assinou:\n${baseUrl}/painel/plataforma/interessados`,
          meta: { tipo: 'interessado', interessado_id: i.id, contrato_id: i.contrato_id },
        })
      } catch (e) { console.error('[demonstracao]', e.message) }
    }
  }

  // Para a plataforma: quem pediu, quando, e até onde foi (abriu, assinou).
  function listar({ limite = 500 } = {}) {
    return repo.listar('interessados').sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, limite).map(i => {
      const c = i.contrato_id ? repo.obter('contratos', i.contrato_id) : null
      const s = c ? repo.listar('signatarios', x => x.contrato_id === c.id)[0] : null
      return {
        id: i.id, nome: i.nome, email: i.email, empresa: i.empresa, telefone: i.telefone, em: i.em, origem: i.origem,
        contrato: c ? { id: c.id, status: c.status, codigo_verificacao: c.codigo_verificacao || null, assinado_em: c.assinado_em || null, expira_em: c.expira_em || null } : null,
        signatario_status: s?.status || null,
        identificado_em: s?.identificado_em || null,
        leitura_completa_em: s?.leitura_completa_em || null,
      }
    })
  }

  return { pedir, listar, garantirOrganizacao, ORG_DEMO }
}
