// Lote: da planilha do RH a N contratos enviados, com progresso.
//
//   receberPlanilha → sugerir mapeamento → prévia (linha a linha) → criar → progresso
//
// A prévia roda o MESMO motor da geração: o que ela diz que está pronto, gera.
// Linha com problema não trava o lote: fica de fora com o motivo, e o RH
// corrige na planilha e sobe só ela depois.
//
// LGPD: a planilha inteira só existe até o lote ser criado. Depois disso fica
// o que foi para os contratos (o snapshot de cada um), e mais nada.

import { acharModelo } from '../biblioteca.js'
import { ErroNegocio } from '../assinatura/servico.js'
import { montarContrato } from '../motor/montar.js'
import { ler } from '../motor/regras.js'
import { TIPOS } from '../motor/tipos.js'
import { aplicarMapeamento, assinaturaColunas, signatariosDaLinha, sugerirMapeamento, variaveisMapeaveis } from './mapear.js'
import { lerPlanilha } from './planilha.js'

const PLANILHA_VALE_HORAS = 24

export function criarLotes({ repo, biblioteca, servico, agora = () => new Date() }) {
  const agoraIso = () => agora().toISOString()

  async function receberPlanilha(organizacaoId, buffer, nomeArquivo) {
    if (!buffer?.length) throw new ErroNegocio(400, 'Arquivo vazio.')
    let planilha
    try {
      planilha = await lerPlanilha(buffer, nomeArquivo)
    } catch (e) {
      throw new ErroNegocio(400, `Não consegui ler a planilha: ${e.message}`)
    }
    limparPlanilhasVelhas()
    const p = repo.inserir('planilhas', {
      organizacao_id: organizacaoId, nome_arquivo: nomeArquivo || 'planilha', criado_em: agoraIso(),
      colunas: planilha.colunas, linhas: planilha.linhas,
    })
    return { planilha_id: p.id, nome_arquivo: p.nome_arquivo, colunas: p.colunas, total: p.linhas.length, amostra: p.linhas.slice(0, 5) }
  }

  function planilhaDa(organizacaoId, id) {
    const p = repo.obter('planilhas', id)
    if (!p || p.organizacao_id !== organizacaoId) throw new ErroNegocio(404, 'Planilha não encontrada. Envie o arquivo de novo.')
    return p
  }

  function chaveMapeamento(organizacaoId, modeloChave, colunas) {
    return `${organizacaoId}:${modeloChave}:${assinaturaColunas(colunas)}`
  }

  // Se já houve um lote com estas mesmas colunas e este modelo, reaproveita o
  // mapeamento que a pessoa confirmou da última vez.
  function sugerir(organizacaoId, planilhaId, modeloChave) {
    const p = planilhaDa(organizacaoId, planilhaId)
    const modelo = acharModelo(biblioteca, modeloChave)
    const salvo = repo.obter('mapeamentos', chaveMapeamento(organizacaoId, modelo.chave, p.colunas))
    return {
      modelo: { chave: modelo.chave, titulo: modelo.titulo },
      origem: salvo ? 'salvo' : 'sugerido',
      mapeamento: salvo ? salvo.mapeamento : sugerirMapeamento(p.colunas, modelo),
      variaveis: variaveisMapeaveis(modelo).map(({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria }) => ({ chave, rotulo, tipo, origem, opcoes, padrao, obrigatoria })),
      colunas: p.colunas,
    }
  }

  function analisarLinhas(p, modelo, mapeamento, organizacao) {
    const emails = new Map()
    const resultado = p.linhas.map(linha => {
      const { dados, avisos } = aplicarMapeamento(linha.valores, mapeamento, modelo)
      const r = montarContrato({ modelo, biblioteca: biblioteca.indice, dados: { ...dados, organizacao }, agora: agora() })
      const problemas = [
        ...r.faltando.filter(f => !f.variavel.startsWith('organizacao.')).map(f => `${f.rotulo}: está em branco`),
        ...r.invalidos.map(i => `${i.rotulo}: ${i.motivo}`),
      ]
      // Dado da organização faltando não é problema da linha: é do cadastro, e trava todas.
      const daOrganizacao = r.faltando.filter(f => f.variavel.startsWith('organizacao.')).map(f => f.rotulo)
      const signatarios = signatariosDaLinha(modelo, { ...dados, organizacao })
      if (!signatarios.length) problemas.push('ninguém para assinar por esta linha')
      for (const s of signatarios) {
        // Em branco já aparece como falta do motor; aqui só o que veio errado.
        if (s.nome && String(s.nome).trim().split(/\s+/).length < 2) problemas.push(`nome de quem assina incompleto ("${s.nome}")`)
        if (s.email && TIPOS.email.validar(s.email)) problemas.push(`e-mail de quem assina inválido ("${s.email}")`)
        const e = String(s.email || '').toLowerCase()
        if (e) emails.set(e, [...(emails.get(e) || []), linha.numero])
      }
      return { linha, dados, avisos, problemas, daOrganizacao, signatarios }
    })
    // O mesmo e-mail em duas linhas costuma ser erro de planilha (copiar e colar).
    for (const r of resultado) {
      for (const s of r.signatarios) {
        const outras = (emails.get(String(s.email).toLowerCase()) || []).filter(n => n !== r.linha.numero)
        if (outras.length) r.avisos.push(`o e-mail ${s.email} também aparece na(s) linha(s) ${outras.join(', ')}`)
      }
    }
    return resultado
  }

  function previa(organizacaoId, organizacao, { planilha_id, modelo: modeloChave, mapeamento }) {
    const p = planilhaDa(organizacaoId, planilha_id)
    const modelo = acharModelo(biblioteca, modeloChave)
    const linhas = analisarLinhas(p, modelo, mapeamento, organizacao)
    const daOrganizacao = [...new Set(linhas.flatMap(l => l.daOrganizacao))]
    return {
      total: linhas.length,
      prontas: linhas.filter(l => !l.problemas.length).length,
      com_problema: linhas.filter(l => l.problemas.length).length,
      cadastro_da_organizacao_incompleto: daOrganizacao,
      linhas: linhas.map(l => ({
        numero: l.linha.numero,
        ok: !l.problemas.length && !daOrganizacao.length,
        quem_assina: l.signatarios.map(s => ({ nome: s.nome, email: s.email })),
        resumo: resumoDaLinha(modelo, l.dados),
        problemas: l.problemas,
        avisos: l.avisos,
      })),
    }
  }

  async function criar(organizacaoId, organizacao, { planilha_id, modelo: modeloChave, mapeamento, nome, assinante_organizacao, prazo_dias }) {
    const p = planilhaDa(organizacaoId, planilha_id)
    const modelo = acharModelo(biblioteca, modeloChave)
    const linhas = analisarLinhas(p, modelo, mapeamento, organizacao)
    const daOrganizacao = [...new Set(linhas.flatMap(l => l.daOrganizacao))]
    if (daOrganizacao.length) throw new ErroNegocio(422, `O cadastro da organização está incompleto: ${daOrganizacao.join(', ')}.`)
    const prontas = linhas.filter(l => !l.problemas.length)
    if (!prontas.length) throw new ErroNegocio(422, 'Nenhuma linha está pronta. Corrija a planilha ou o mapeamento.')

    let assinante = null
    if (assinante_organizacao?.email || assinante_organizacao?.nome) {
      const { nome: an = '', email: ae = '' } = assinante_organizacao
      if (String(an).trim().split(/\s+/).length < 2) throw new ErroNegocio(400, 'Nome completo de quem assina pela empresa é obrigatório.')
      if (TIPOS.email.validar(ae)) throw new ErroNegocio(400, 'E-mail de quem assina pela empresa é inválido.')
      assinante = { nome: String(an).trim(), email: String(ae).trim().toLowerCase(), status: 'aguardando', ciencias: {} }
    }

    const lote = repo.inserir('lotes', {
      organizacao_id: organizacaoId,
      organizacao_nome: organizacao.razao_social,
      nome: String(nome || '').trim() || `${modelo.titulo} — ${new Date(agoraIso()).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      modelo: { chave: modelo.chave, versao: modelo.versao },
      modelo_titulo: modelo.titulo,
      nome_arquivo: p.nome_arquivo,
      colunas_resumo: (modelo.resumo_lote || []).map(k => modelo.variaveis.find(v => v.chave === k)?.rotulo || k),
      status: 'gerando',
      criado_em: agoraIso(),
      assinante,
      linhas: [],
    })

    const registro = []
    for (const l of linhas) {
      const base = { numero: l.linha.numero, resumo: resumoDaLinha(modelo, l.dados) }
      if (l.problemas.length) { registro.push({ ...base, problemas: l.problemas }); continue }
      try {
        const c = await servico.gerar({ organizacaoId, organizacao, modelo: modelo.chave, dados: l.dados })
        const signatarios = [
          ...l.signatarios.map(s => ({ ...s, papel: s.papel || 'parte' })),
          ...(assinante ? [{ nome: assinante.nome, email: assinante.email, papel: 'representante', canal: 'lote', lote_id: lote.id }] : []),
        ]
        await servico.enviar(c.id, organizacaoId, { signatarios, ordem: 'paralela', prazo_dias }, { interno: true })
        registro.push({ ...base, contrato_id: c.id })
      } catch (e) {
        registro.push({ ...base, problemas: [e.message] })
      }
    }

    repo.atualizar('lotes', lote.id, { linhas: registro, status: 'enviado', enviado_em: agoraIso() })
    const chave = chaveMapeamento(organizacaoId, modelo.chave, p.colunas)
    if (repo.obter('mapeamentos', chave)) repo.atualizar('mapeamentos', chave, { mapeamento, atualizado_em: agoraIso() })
    else repo.inserir('mapeamentos', { id: chave, mapeamento, atualizado_em: agoraIso() })
    repo.remover('planilhas', p.id)

    if (assinante && registro.some(r => r.contrato_id)) await servico.convidarAssinanteLote(lote.id)
    return progresso(organizacaoId, lote.id)
  }

  function loteDa(organizacaoId, id) {
    const l = repo.obter('lotes', id)
    if (!l || l.organizacao_id !== organizacaoId) throw new ErroNegocio(404, 'Lote não encontrado.')
    return l
  }

  function progresso(organizacaoId, id) {
    const lote = loteDa(organizacaoId, id)
    const itens = servico.itensDoLote(lote)
    const porContrato = new Map(itens.map(i => [i.c.id, i]))
    const linhas = lote.linhas.map(l => {
      if (!l.contrato_id) return { numero: l.numero, resumo: l.resumo, situacao: 'nao_gerado', problemas: l.problemas }
      const { c } = porContrato.get(l.contrato_id)
      const sigs = repo.listar('signatarios', s => s.contrato_id === c.id)
      const pessoas = sigs.filter(s => s.canal !== 'lote')
      return {
        numero: l.numero, resumo: l.resumo, contrato_id: c.id, situacao: c.status,
        pessoas: pessoas.map(s => ({ id: s.id, nome: s.nome, email: s.email, status: s.status, assinado_em: s.assinado_em || null, recusa_motivo: s.recusa_motivo || null })),
        empresa: sigs.find(s => s.canal === 'lote')?.status || null,
        codigo_verificacao: c.codigo_verificacao || null,
      }
    })
    const conta = (f) => linhas.filter(f).length
    return {
      id: lote.id, nome: lote.nome, modelo: lote.modelo_titulo, nome_arquivo: lote.nome_arquivo,
      criado_em: lote.criado_em, colunas_resumo: lote.colunas_resumo,
      assinante: lote.assinante ? { nome: lote.assinante.nome, email: lote.assinante.email, status: lote.assinante.status, assinado_em: lote.assinante.assinado_em || null } : null,
      totais: {
        linhas: linhas.length,
        nao_geradas: conta(l => l.situacao === 'nao_gerado'),
        contratos: conta(l => l.contrato_id),
        assinados: conta(l => l.situacao === 'assinado'),
        aguardando: conta(l => ['enviado', 'parcialmente_assinado'].includes(l.situacao)),
        recusados: conta(l => l.situacao === 'recusado'),
        expirados: conta(l => l.situacao === 'expirado'),
        cancelados: conta(l => l.situacao === 'cancelado'),
      },
      linhas,
    }
  }

  function listar(organizacaoId) {
    return repo.listar('lotes', l => l.organizacao_id === organizacaoId)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(l => {
        const p = progresso(organizacaoId, l.id)
        return { id: l.id, nome: l.nome, modelo: l.modelo_titulo, criado_em: l.criado_em, totais: p.totais, assinante: p.assinante }
      })
  }

  // Lembrete = link novo para quem ainda não assinou (o anterior deixa de valer).
  async function lembrar(organizacaoId, id) {
    const lote = loteDa(organizacaoId, id)
    let pessoas = 0
    for (const { c } of servico.itensDoLote(lote)) {
      if (!servico.EM_ASSINATURA.has(c.status)) continue
      for (const s of repo.listar('signatarios', x => x.contrato_id === c.id && x.canal !== 'lote' && ['notificado', 'identificado'].includes(x.status))) {
        await servico.reenviar(c.id, organizacaoId, s.id)
        pessoas++
      }
    }
    let empresa = false
    const pendenteEmpresa = servico.itensDoLote(lote).some(({ c, s }) => s && servico.EM_ASSINATURA.has(c.status) && s.status !== 'assinado')
    if (lote.assinante && pendenteEmpresa) { await servico.convidarAssinanteLote(lote.id); empresa = true }
    return { lembretes_enviados: pessoas, empresa_lembrada: empresa }
  }

  // CSV para o RH abrir no Excel: ";" e BOM, senão o acento quebra.
  function relatorioCsv(organizacaoId, id) {
    const p = progresso(organizacaoId, id)
    const SITUACAO = {
      nao_gerado: 'não gerado', enviado: 'aguardando', parcialmente_assinado: 'assinado em parte',
      assinado: 'assinado', recusado: 'recusado', expirado: 'expirado', cancelado: 'cancelado',
    }
    const cab = ['Linha', ...p.colunas_resumo, 'Quem assina', 'E-mail', 'Situação', 'Pessoa assinou em', 'Empresa assinou', 'Código de verificação', 'Observação']
    const csv = (v) => {
      const s = String(v ?? '')
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const linhas = p.linhas.map(l => [
      l.numero,
      ...p.colunas_resumo.map(col => l.resumo?.find(r => r.rotulo === col)?.valor ?? ''),
      (l.pessoas || []).map(s => s.nome).join(' / '),
      (l.pessoas || []).map(s => s.email).join(' / '),
      SITUACAO[l.situacao] || l.situacao,
      (l.pessoas || []).map(s => (s.assinado_em ? new Date(s.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')).join(' / '),
      l.empresa === 'assinado' ? 'sim' : l.empresa ? 'não' : '',
      l.codigo_verificacao || '',
      [...(l.problemas || []), ...(l.pessoas || []).filter(s => s.recusa_motivo).map(s => `recusou: ${s.recusa_motivo}`)].join('; '),
    ])
    return '﻿' + [cab, ...linhas].map(l => l.map(csv).join(';')).join('\r\n') + '\r\n'
  }

  function limparPlanilhasVelhas() {
    const limite = new Date(agora().getTime() - PLANILHA_VALE_HORAS * 3600e3).toISOString()
    for (const p of repo.listar('planilhas', x => x.criado_em < limite)) repo.remover('planilhas', p.id)
  }

  function resumoDaLinha(modelo, dados) {
    return (modelo.resumo_lote || []).map(k => {
      const def = modelo.variaveis.find(v => v.chave === k)
      const v = ler(dados, k)
      let valor = v ?? ''
      if (v !== undefined && v !== '' && def && TIPOS[def.tipo] && !TIPOS[def.tipo].validar(v, def)) valor = TIPOS[def.tipo].formatar(v, def, def.tipo === 'moeda' ? 'numero' : undefined)
      return { rotulo: def?.rotulo || k, valor: String(valor) }
    })
  }

  return { receberPlanilha, sugerir, previa, criar, progresso, listar, lembrar, relatorioCsv }
}
