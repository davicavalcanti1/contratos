// Relatório de evidências em PDF: a versão humana do dossiê, para juntar num
// processo. A versão de máquina é o JSON do mesmo dossiê (mesmos dados).

import PDFDocument from 'pdfkit'
import { COR, faixaSeguranca, registrarFontes, roseta, rotulo } from '../motor/estilo-pdf.js'
import { dataHora } from '../motor/pdf.js'

const M = 56

const ROTULOS = {
  'contrato.gerado': 'Contrato gerado',
  'contrato.enviado': 'Enviado para assinatura',
  'link.enviado': 'Link enviado',
  'lembrete.enviado': 'Lembrete enviado ao signatário',
  'link.aberto': 'Link aberto',
  'otp.enviado': 'Código enviado',
  'otp.falhou': 'Código incorreto',
  'otp.validado': 'Identidade confirmada por código',
  'clausula.ciencia': 'Ciência de cláusula em destaque',
  'clausula.duvida': 'Dúvida sobre cláusula',
  'clausula.resposta': 'Resposta à dúvida',
  'documento.lido_ate_o_fim': 'Leitura até o fim',
  'assinatura.aceita': 'Assinou',
  'assinatura.recusada': 'Recusou',
  'documento.selado': 'Documento selado',
  'contrato.cancelado': 'Cancelado',
  'contrato.expirado': 'Expirado',
  'aditivo.gerado': 'Termo aditivo gerado',
  'distrato.gerado': 'Distrato gerado',
  'contrato.aditado': 'Aditado (aditivo assinado)',
  'distrato.assinado': 'Distrato assinado (vale até a data combinada)',
  'contrato.distratado': 'Distratado',
  'contrato.encerrado': 'Encerrado no fim do prazo',
  'documento.carimbado': 'Carimbo do tempo aplicado',
  'carimbo.pendente': 'Carimbo do tempo pendente',
  'icp.recusado': 'Assinatura com certificado recusada',
}

export function gerarDossiePdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Dossiê de evidências — ${d.contrato.titulo}` } })
    const partes = []
    doc.on('data', b => partes.push(b))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(partes)))
    registrarFontes(doc)
    const W = doc.page.width - M * 2
    const nomes = Object.fromEntries(d.signatarios.map(s => [`signatario:${s.id}`, s.nome]))

    roseta(doc, M + W - 34, M + 10, 46, { opacidade: 0.3 })
    rotulo(doc, 'Dossiê de evidências', M, M - 12, { largura: W - 100 })
    doc.font('titulo').fontSize(22).fillColor(COR.tinta).text(d.contrato.titulo, M, M + 2, { width: W - 100 })
    doc.font('sans').fontSize(8.5).fillColor(COR.tinta2).text(`Emitido em ${dataHora(d.emitido_em)} (horário de Brasília)`, { width: W - 100 })
    doc.y = Math.max(doc.y, M + 62) + 8
    doc.save().lineWidth(0.6).strokeColor(COR.tinta).moveTo(M, doc.y).lineTo(M + W, doc.y).stroke()
      .lineWidth(0.3).moveTo(M, doc.y + 2.5).lineTo(M + W, doc.y + 2.5).stroke().restore()
    doc.y += 12

    secao(doc, 'Documento')
    campo(doc, 'Título', d.contrato.titulo)
    campo(doc, 'Emitente', d.contrato.organizacao)
    campo(doc, 'Modelo', `${d.contrato.modelo.chave} v${d.contrato.modelo.versao}`)
    campo(doc, 'Situação', d.contrato.status)
    campo(doc, 'Código de verificação', d.contrato.codigo_verificacao || '—')

    secao(doc, 'Integridade')
    campo(doc, 'Conteúdo SHA-256', d.integridade.conteudo_sha256)
    campo(doc, 'PDF original SHA-256', d.integridade.pdf_original_sha256)
    campo(doc, 'PDF final SHA-256', d.integridade.pdf_final_sha256 || '—')
    campo(doc, 'Trilha de eventos', d.integridade.trilha.integra
      ? `íntegra — ${d.integridade.trilha.eventos} eventos encadeados; hash final ${d.integridade.trilha.hash_final}`
      : `QUEBRADA no evento ${d.integridade.trilha.quebra_em}: ${d.integridade.trilha.motivo}`)
    const ct = d.integridade.carimbo_do_tempo
    campo(doc, 'Carimbo do tempo', ct?.gen_time
      ? `${ct.act}${ct.icp_brasil ? ' (ACT credenciada na ICP-Brasil)' : ' (ACT fora da ICP-Brasil)'}, em ${dataHora(ct.gen_time)}, nº de série ${ct.serial}, sobre o SHA-256 do PDF assinado`
      : ct?.pendente ? `pendente: ${ct.motivo}` : 'não aplicado — horários do servidor do provedor')
    if (ct?.gen_time) campo(doc, 'Conferência independente', 'openssl ts -verify -data <PDF assinado> -in <carimbo.tsr> -CAfile <cadeia da ACT>')

    secao(doc, 'Signatários')
    for (const s of d.signatarios) {
      doc.font('serif-forte').fontSize(11).fillColor(COR.tinta).text(`${s.ordem}. ${s.nome}`, M, doc.y, { width: W })
      doc.font('sans').fontSize(8.5).fillColor(COR.tinta2)
      ;[
        `${s.papel}${s.cpf ? ` · CPF ${s.cpf}` : ''} · ${s.email} · situação: ${s.status}`,
        `Identidade confirmada: ${dataHora(s.identificado_em)} · leitura até o fim: ${dataHora(s.leitura_completa_em)}`,
        `Ciências: ${Object.keys(s.ciencias || {}).length} cláusula(s) · assinou: ${dataHora(s.assinado_em)}${s.nome_digitado && !s.evidencias?.certificado ? ` · nome digitado "${s.nome_digitado}"` : ''}`,
        s.evidencias ? `IP ${s.evidencias.ip || '—'} · ${s.evidencias.user_agent || '—'}${s.evidencias.geo ? ` · local ${s.evidencias.geo.lat}, ${s.evidencias.geo.lng} (±${s.evidencias.geo.precisao_m ?? '?'} m)` : ''}` : null,
        s.evidencias?.certificado ? `Certificado ICP-Brasil: ${s.evidencias.certificado.nome}, série ${s.evidencias.certificado.serial}; cadeia ${s.evidencias.certificado.cadeia.join(' > ')}` : null,
        s.evidencias?.certificado ? `PDF assinado com o certificado: SHA-256 ${s.evidencias.certificado.sha256}. Revogação ${s.evidencias.certificado.revogacao}` : null,
        s.recusa_motivo ? `Recusou em ${dataHora(s.recusado_em)}: "${s.recusa_motivo}"${s.recusa_clausula ? ` · cláusula apontada: ${s.recusa_clausula.numero} (${s.recusa_clausula.titulo})` : ''}` : null,
      ].filter(Boolean).forEach(l => doc.text(l, { width: W }))
      doc.moveDown(0.6)
    }

    if (d.duvidas?.length) {
      secao(doc, 'Dúvidas e respostas')
      doc.font('sans').fontSize(8).fillColor(COR.tinta2).text('O signatário perguntou antes de assinar; a resposta explica, e o texto do contrato prevalece.', { width: W })
      doc.moveDown(0.4)
      for (const q of d.duvidas) {
        if (doc.y > doc.page.height - M - 80) doc.addPage()
        doc.font('sans-forte').fontSize(8.5).fillColor(COR.tinta).text(`Cláusula ${q.numero} (${q.titulo}) · ${nomes[`signatario:${q.signatario_id}`] || 'signatário'} · ${dataHora(q.em)}`, M, doc.y, { width: W })
        doc.font('serif').fontSize(9.5).fillColor(COR.tinta).text(`Pergunta: "${q.pergunta}"`, { width: W })
        doc.font('sans').fontSize(8.5).fillColor(q.resposta ? COR.tinta : COR.tinta3).text(q.resposta ? `Resposta${q.respondida_por ? ` de ${q.respondida_por}` : ''}, ${dataHora(q.respondida_em)}: ${q.resposta}` : 'Sem resposta até a emissão deste dossiê.', { width: W })
        doc.moveDown(0.5)
      }
    }

    secao(doc, 'Trilha de eventos')
    doc.font('sans').fontSize(8).fillColor(COR.tinta2)
      .text('Cada evento guarda o hash do anterior. Alterar, remover ou reordenar um evento quebra a corrente a partir dele.', { width: W })
    doc.moveDown(0.4)
    for (const e of d.eventos) {
      if (doc.y > doc.page.height - M - 40) doc.addPage()
      const quem = e.ator === 'sistema' ? 'sistema' : (nomes[e.ator] || e.ator)
      doc.font('mono').fontSize(7.5).fillColor(COR.carimbo).text(`#${e.seq}  ${dataHora(e.em)}  `, M, doc.y, { width: W, continued: true })
        .font('sans-forte').fontSize(8.5).fillColor(COR.tinta).text(`${ROTULOS[e.tipo] || e.tipo}  ·  ${quem}`)
      const extra = detalhe(e)
      doc.font('sans').fontSize(7.5).fillColor(COR.tinta2)
      if (extra) doc.text(extra, { width: W })
      doc.font('mono').fontSize(6.5).fillColor(COR.tinta3).text(`hash ${e.hash}${e.ip ? `  ·  IP ${e.ip}` : ''}`, { width: W })
      doc.moveDown(0.3)
    }

    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      doc.page.margins.bottom = 0
      faixaSeguranca(doc)
      doc.font('mono').fontSize(6.5).fillColor(COR.tinta3)
        .text(`Dossiê · ${d.contrato.id} · página ${i + 1} de ${count}`, M, doc.page.height - M + 20, { width: W, align: 'center', lineBreak: false })
    }
    doc.end()
  })
}

function secao(doc, t) {
  if (doc.y > doc.page.height - M - 80) doc.addPage()
  doc.moveDown(0.6)
  rotulo(doc, t, M, doc.y)
  doc.moveDown(0.4)
}

function campo(doc, k, v) {
  const mono = /SHA-256|Código|Conferência/.test(k)
  doc.font('sans-forte').fontSize(8.5).fillColor(COR.tinta2).text(`${k}: `, M, doc.y, { continued: true })
    .font(mono ? 'mono' : 'sans').fontSize(mono ? 8 : 8.5).fillColor(COR.tinta).text(String(v ?? '—'))
}

function detalhe(e) {
  const d = e.dados || {}
  switch (e.tipo) {
    case 'clausula.ciencia': return `Cláusula ${d.numero} (${d.clausula} v${d.versao}). Resumo exibido: "${d.resumo_exibido}"${d.tempo_leitura_ms_informado != null ? ` · tempo de leitura informado pelo navegador: ${Math.round(d.tempo_leitura_ms_informado / 1000)} s` : ''}`
    case 'assinatura.aceita': return d.metodo === 'icp_brasil'
      ? `Certificado ICP-Brasil de ${d.titular}, série ${d.serial} · cadeia ${(d.cadeia || []).join(' > ')} · PDF assinado SHA-256 ${d.arquivo_sha256} · ${d.ciencias} ciência(s)`
      : `Método: ${d.metodo}${d.via_lote ? ' (em lote)' : ''} · nome digitado "${d.nome_digitado}" · ${d.ciencias} ciência(s)`
    case 'icp.recusado': return `Motivo: ${(d.motivos || [d.motivo]).filter(Boolean).join('; ')}`
    case 'documento.carimbado': return `${d.act}${d.icp_brasil ? ' (ICP-Brasil)' : ' (fora da ICP-Brasil)'} · ${dataHora(d.gen_time)} · série ${d.serial}`
    case 'carimbo.pendente': return `Motivo: ${d.motivo}`
    case 'assinatura.recusada': return `Motivo: "${d.motivo}"`
    case 'clausula.duvida': return `Cláusula ${d.numero}: "${d.pergunta}"`
    case 'clausula.resposta': return `Cláusula ${d.numero}${d.por ? `, por ${d.por}` : ''}: "${d.resposta}"`
    case 'otp.enviado': case 'link.enviado': return `Destino: ${d.destino}`
    case 'lembrete.enviado': return `Destino: ${d.destino}${d.dias ? ` · ${d.dias} dia(s) antes de expirar` : ''}`
    case 'contrato.gerado': return `Conteúdo ${d.conteudo_sha256} · PDF original ${d.pdf_original_sha256}`
    case 'documento.selado': return `Código ${d.codigo_verificacao} · PDF final ${d.pdf_final_sha256}`
    case 'contrato.enviado': return `Ordem ${d.ordem} · ${d.signatarios.map(s => s.nome).join(', ')}`
    default: return null
  }
}
