// Relatório de evidências em PDF: a versão humana do dossiê, para juntar num
// processo. A versão de máquina é o JSON do mesmo dossiê (mesmos dados).

import PDFDocument from 'pdfkit'
import { dataHora } from '../motor/pdf.js'

const M = 56

const ROTULOS = {
  'contrato.gerado': 'Contrato gerado',
  'contrato.enviado': 'Enviado para assinatura',
  'link.enviado': 'Link enviado',
  'link.aberto': 'Link aberto',
  'otp.enviado': 'Código enviado',
  'otp.falhou': 'Código incorreto',
  'otp.validado': 'Identidade confirmada por código',
  'clausula.ciencia': 'Ciência de cláusula em destaque',
  'documento.lido_ate_o_fim': 'Leitura até o fim',
  'assinatura.aceita': 'Assinou',
  'assinatura.recusada': 'Recusou',
  'documento.selado': 'Documento selado',
  'contrato.cancelado': 'Cancelado',
  'contrato.expirado': 'Expirado',
}

export function gerarDossiePdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `Dossiê de evidências — ${d.contrato.titulo}` } })
    const partes = []
    doc.on('data', b => partes.push(b))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(partes)))
    const W = doc.page.width - M * 2
    const nomes = Object.fromEntries(d.signatarios.map(s => [`signatario:${s.id}`, s.nome]))

    doc.font('Helvetica-Bold').fontSize(15).text('Dossiê de evidências de assinatura')
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(`Emitido em ${dataHora(d.emitido_em)} (horário de Brasília)`)
    doc.moveDown()

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
    campo(doc, 'Carimbo do tempo', d.integridade.carimbo_do_tempo ? 'ACT ICP-Brasil' : 'não aplicado — horários do servidor do provedor')

    secao(doc, 'Signatários')
    for (const s of d.signatarios) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(`${s.ordem}. ${s.nome}`)
      doc.font('Helvetica').fontSize(8.5).fillColor('#333')
      ;[
        `${s.papel}${s.cpf ? ` · CPF ${s.cpf}` : ''} · ${s.email} · situação: ${s.status}`,
        `Identidade confirmada: ${dataHora(s.identificado_em)} · leitura até o fim: ${dataHora(s.leitura_completa_em)}`,
        `Ciências: ${Object.keys(s.ciencias || {}).length} cláusula(s) · assinou: ${dataHora(s.assinado_em)}${s.nome_digitado ? ` · nome digitado "${s.nome_digitado}"` : ''}`,
        s.evidencias ? `IP ${s.evidencias.ip || '—'} · ${s.evidencias.user_agent || '—'}${s.evidencias.geo ? ` · local ${s.evidencias.geo.lat}, ${s.evidencias.geo.lng} (±${s.evidencias.geo.precisao_m ?? '?'} m)` : ''}` : null,
        s.recusa_motivo ? `Recusou em ${dataHora(s.recusado_em)}: "${s.recusa_motivo}"` : null,
      ].filter(Boolean).forEach(l => doc.text(l, { width: W }))
      doc.moveDown(0.6)
    }

    secao(doc, 'Trilha de eventos')
    doc.font('Helvetica').fontSize(7.5).fillColor('#555')
      .text('Cada evento guarda o hash do anterior. Alterar, remover ou reordenar um evento quebra a corrente a partir dele.', { width: W })
    doc.moveDown(0.4)
    for (const e of d.eventos) {
      if (doc.y > doc.page.height - M - 40) doc.addPage()
      const quem = e.ator === 'sistema' ? 'sistema' : (nomes[e.ator] || e.ator)
      doc.font('Helvetica-Bold').fontSize(8).fillColor('black')
        .text(`#${e.seq}  ${dataHora(e.em)}  ${ROTULOS[e.tipo] || e.tipo}  —  ${quem}`, { width: W })
      const extra = detalhe(e)
      doc.font('Helvetica').fontSize(7).fillColor('#444')
      if (extra) doc.text(extra, { width: W })
      doc.fillColor('#888').text(`hash ${e.hash}${e.ip ? `  ·  IP ${e.ip}` : ''}`, { width: W })
      doc.moveDown(0.3)
    }

    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7).fillColor('#888')
        .text(`Dossiê · ${d.contrato.id} · página ${i + 1} de ${count}`, M, doc.page.height - M + 20, { width: W, align: 'center', lineBreak: false })
    }
    doc.end()
  })
}

function secao(doc, t) {
  if (doc.y > doc.page.height - M - 80) doc.addPage()
  doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11).fillColor('#1f3a5f').text(t.toUpperCase())
  doc.moveDown(0.3)
}

function campo(doc, k, v) {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#333').text(`${k}: `, { continued: true })
    .font('Helvetica').fillColor('black').text(String(v ?? '—'))
}

function detalhe(e) {
  const d = e.dados || {}
  switch (e.tipo) {
    case 'clausula.ciencia': return `Cláusula ${d.numero} (${d.clausula} v${d.versao}). Resumo exibido: "${d.resumo_exibido}"${d.tempo_leitura_ms_informado != null ? ` · tempo de leitura informado pelo navegador: ${Math.round(d.tempo_leitura_ms_informado / 1000)} s` : ''}`
    case 'assinatura.aceita': return `Método: ${d.metodo} · nome digitado "${d.nome_digitado}" · ${d.ciencias} ciência(s)`
    case 'assinatura.recusada': return `Motivo: "${d.motivo}"`
    case 'otp.enviado': case 'link.enviado': return `Destino: ${d.destino}`
    case 'contrato.gerado': return `Conteúdo ${d.conteudo_sha256} · PDF original ${d.pdf_original_sha256}`
    case 'documento.selado': return `Código ${d.codigo_verificacao} · PDF final ${d.pdf_final_sha256}`
    case 'contrato.enviado': return `Ordem ${d.ordem} · ${d.signatarios.map(s => s.nome).join(', ')}`
    default: return null
  }
}
