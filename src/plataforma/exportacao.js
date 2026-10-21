// Exportação completa da organização: um .zip com todos os contratos (cada
// um com os mesmos arquivos do pacote de prova), um índice que abre no
// Excel, o diretório de pessoas e os dados da conta. É a promessa "a prova é
// do cliente" (VISION.md) como botão: sair do sistema não destrói prova
// nenhuma, e é também a portabilidade da LGPD.
//
// O zip é escrito direto na resposta (pode ter centenas de MB); uma
// exportação por organização de cada vez; quem pediu fica na auditoria.

import archiver from 'archiver'
import { montarPacote, slug } from '../assinatura/pacote.js'
import { dataHora } from '../motor/pdf.js'
import { marcaPublica } from './marca.js'
import { ErroNegocio } from '../assinatura/servico.js'

// CSV com ; e BOM, que o Excel brasileiro abre com acento certo.
export function csv(linhas) {
  const celula = (v) => { const s = v == null ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + linhas.map(l => l.map(celula).join(';')).join('\r\n') + '\r\n'
}

export function criarExportacao({ repo, servico, partes = null, auditar = () => {}, config = {}, agora = () => new Date() }) {
  const baseUrl = (config.baseUrl || 'http://localhost:3000').replace(/\/$/, '')
  const emCurso = new Set()

  function contratosDe(organizacaoId, desde) {
    const d = desde ? String(desde).slice(0, 10) : null
    return repo.listar('contratos', c => c.organizacao_id === organizacaoId && (!d || c.criado_em >= d))
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
  }

  // Escreve o zip em `saida` (um stream de escrita, normalmente a resposta HTTP).
  async function escrever({ organizacaoId, desde = null, saida, ator = null }) {
    const org = repo.obter('organizacoes', organizacaoId)
    if (!org) throw new ErroNegocio(404, 'Organização não encontrada.')
    if (emCurso.has(organizacaoId)) throw new ErroNegocio(429, 'Já há uma exportação desta organização em andamento. Espere ela terminar.')
    emCurso.add(organizacaoId)
    const inicio = agora()
    try {
      const contratos = contratosDe(organizacaoId, desde)
      auditar(ator, 'organizacao.exportada', { organizacao_id: organizacaoId, dados: { contratos: contratos.length, desde: desde || null } })

      const arq = archiver('zip', { zlib: { level: 6 } })
      const pronto = new Promise((ok, erro) => { saida.on('finish', ok); saida.on('close', ok); arq.on('error', erro); saida.on('error', erro) })
      arq.pipe(saida)

      const indice = [['id', 'referencia', 'titulo', 'modelo', 'situacao', 'criado_em', 'enviado_em', 'assinado_em', 'codigo_verificacao', 'signatarios', 'lote_id', 'pasta']]
      let arquivos = 0
      for (const c of contratos) {
        const pasta = `contratos/${(c.assinado_em || c.criado_em).slice(0, 7)}/${slug(c.titulo)}-${c.id.slice(0, 8)}`
        const { entradas } = await montarPacote({ servico, contratoId: c.id, organizacaoId, baseUrl })
        for (const [nome, buffer] of entradas) { arq.append(buffer, { name: `${pasta}/${nome}` }); arquivos++ }
        const sigs = repo.listar('signatarios', s => s.contrato_id === c.id).sort((a, b) => a.ordem - b.ordem)
        indice.push([c.id, c.referencia || '', c.titulo, c.modelo?.chave || '', c.status, c.criado_em, c.enviado_em || '', c.assinado_em || '', c.codigo_verificacao || '', sigs.map(s => `${s.nome} <${s.email}> (${s.status})`).join(' | '), c.lote_id || '', pasta])
      }
      arq.append(Buffer.from(csv(indice), 'utf8'), { name: 'indice.csv' })

      const pessoas = partes ? partes.listar(organizacaoId, { limite: 200 }).itens : []
      let pagina = 2
      while (partes && pessoas.length === 200 * (pagina - 1)) { const mais = partes.listar(organizacaoId, { limite: 200, pagina }).itens; pessoas.push(...mais); pagina++; if (!mais.length) break }
      arq.append(Buffer.from(csv([['nome', 'tipo', 'cpf', 'cnpj', 'email', 'contratos', 'ultimo_contrato', 'ultimo_em'], ...pessoas.map(p => [p.nome, p.tipo, p.cpf || '', p.cnpj || '', p.email || '', p.contratos, p.ultimo_contrato_id || '', p.ultimo_em || ''])]), 'utf8'), { name: 'pessoas.csv' })

      const conta = {
        exportado_em: inicio.toISOString(),
        organizacao: { id: org.id, dados: org.dados, status: org.status, plano: org.plano, criada_em: org.criada_em, marca: marcaPublica(org) },
        usuarios: repo.listar('usuarios', u => u.organizacao_id === organizacaoId).map(u => ({ nome: u.nome, email: u.email, papel: u.papel, ativo: !!u.ativo, criado_em: u.criado_em || null })),
        chaves_api: repo.listar('chaves_api', k => k.organizacao_id === organizacaoId).map(k => ({ nome: k.nome, escopo: k.escopo, criada_em: k.criada_em || null, revogada_em: k.revogada_em || null })),
        webhooks: repo.listar('webhooks', w => w.organizacao_id === organizacaoId).map(w => ({ url: w.url, eventos: w.eventos, ativo: !!w.ativo })),
        lotes: repo.listar('lotes', l => l.organizacao_id === organizacaoId).map(l => ({ id: l.id, nome: l.nome, modelo: l.modelo?.chave || null, criado_em: l.criado_em || null, contratos: (l.linhas || []).filter(x => x.contrato_id).length })),
      }
      arq.append(Buffer.from(JSON.stringify(conta, null, 2)), { name: 'organizacao.json' })
      const auditoria = repo.listar('auditoria', a => a.organizacao_id === organizacaoId).sort((a, b) => a.em.localeCompare(b.em))
      arq.append(Buffer.from(JSON.stringify(auditoria, null, 2)), { name: 'auditoria.json' })
      const logo = org.marca?.logo?.arquivo ? await repo.lerArquivo(org.marca.logo.arquivo) : null
      if (logo) arq.append(logo, { name: `logotipo.${org.marca.logo.arquivo.split('.').pop()}` })

      const leiame = [
        `EXPORTAÇÃO COMPLETA`,
        `${org.dados?.razao_social || org.id}`,
        `Gerada em ${dataHora(inicio.toISOString())} (horário de Brasília)${ator?.email ? ` por ${ator.email}` : ator?.tipo === 'chave_api' ? ' pela API' : ''}.`,
        `${contratos.length} contrato(s)${desde ? ` criados a partir de ${desde}` : ''}, ${arquivos} arquivo(s).`,
        ``,
        `O QUE HÁ AQUI`,
        `- indice.csv: um contrato por linha (abre no Excel): situação, datas, código de verificação, quem assina e a pasta dele aqui dentro.`,
        `- contratos/<ano-mês>/<título-id>/: para cada contrato, os mesmos arquivos do pacote de prova: contrato-assinado.pdf (quando concluído), contrato-original.pdf, dossie.pdf, dossie.json, carimbo.tsr e assinatura-icp-*.pdf quando existem, e um LEIA-ME.txt com os hashes e os comandos de conferência.`,
        `- pessoas.csv: o diretório de pessoas e empresas que receberam contrato.`,
        `- organizacao.json: dados da empresa, marca, usuários, lotes, webhooks (sem os segredos) e chaves de API (sem o valor).`,
        `- auditoria.json: quem fez o quê na conta.`,
        `- logotipo.*: o logotipo da marca, se houver.`,
        ``,
        `Esta é a sua cópia. Guarde em lugar seguro: mesmo que a conta seja encerrada, a prova de cada contrato continua com você, e cada pasta se confere sozinha (veja o LEIA-ME.txt dentro dela).`,
      ].join('\n')
      arq.append(Buffer.from(leiame, 'utf8'), { name: 'LEIA-ME.txt' })

      await arq.finalize()
      await pronto
      return { contratos: contratos.length, arquivos }
    } finally {
      emCurso.delete(organizacaoId)
    }
  }

  const nomeArquivo = (organizacaoId) => `exportacao-${slug(repo.obter('organizacoes', organizacaoId)?.dados?.razao_social || organizacaoId)}-${agora().toISOString().slice(0, 10)}.zip`

  return { escrever, nomeArquivo, contratosDe }
}
