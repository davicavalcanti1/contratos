// PDF do contrato montado. Cláusula crítica sai EM DESTAQUE (negrito + barra
// lateral): é a forma que o CDC art. 54 §4º pede para cláusula que limita
// direito, e a mesma marcação que a "bula" usa na tela de assinatura.
//
// Duas versões do mesmo conteúdo:
//   - ORIGINAL (sem opções): o que vai para assinatura. Rodapé com o hash do
//     conteúdo.
//   - FINAL (com `selo` e `assinaturas`): o mesmo texto, mais o QR e o código
//     de verificação em cada página e a página de assinaturas no fim. O hash do
//     conteúdo é o mesmo nas duas, e é ele que prova que o texto não mudou.

import { createHash } from 'node:crypto'
import PDFDocument from 'pdfkit'

const MARGEM = 64
const COR_DESTAQUE = '#1f3a5f'
const QR = 46

export function gerarPdf(contrato, { selo = null, assinaturas = null } = {}) {
  return new Promise((resolve, reject) => {
    const rodape = selo ? QR + 22 : 16
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM, bottom: MARGEM + rodape, left: MARGEM, right: MARGEM },
      bufferPages: true,
      info: {
        Title: contrato.titulo,
        Subject: `Modelo ${contrato.modelo.chave} v${contrato.modelo.versao}`,
        CreationDate: new Date(contrato.gerado_em),
      },
    })
    const partes = []
    doc.on('data', b => partes.push(b))
    doc.on('error', reject)
    doc.on('end', () => {
      const buffer = Buffer.concat(partes)
      resolve({ buffer, sha256: createHash('sha256').update(buffer).digest('hex') })
    })

    const largura = doc.page.width - MARGEM * 2

    doc.font('Helvetica-Bold').fontSize(14).text(contrato.titulo.toUpperCase(), { align: 'center' })
    doc.moveDown(1.2)
    if (contrato.preambulo) {
      doc.font('Helvetica').fontSize(10.5).text(contrato.preambulo, { align: 'justify', lineGap: 2 })
      doc.moveDown(0.8)
    }

    for (const c of contrato.clausulas) {
      garantirEspaco(doc, 60)
      doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
        .text(`CLÁUSULA ${c.numero} — ${c.titulo.toUpperCase()}${c.critica ? '  (DESTAQUE)' : ''}`, MARGEM, doc.y, { width: largura })
      doc.moveDown(0.4)

      for (const p of c.paragrafos) {
        const texto = `${p.numero}. ${p.texto}`
        const opts = { width: largura - (c.critica ? 10 : 0), align: 'justify', lineGap: 2 }
        doc.font(c.critica ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5)
        const altura = doc.heightOfString(texto, opts)
        garantirEspaco(doc, Math.min(altura, 200))
        const y = doc.y
        if (c.critica) {
          doc.save().rect(MARGEM, y, 3, altura).fill(COR_DESTAQUE).restore()
          doc.fillColor('black').text(texto, MARGEM + 10, y, opts)
        } else {
          doc.text(texto, MARGEM, y, opts)
        }
        doc.moveDown(0.5)
      }
      doc.moveDown(0.5)
    }

    if (contrato.fecho) {
      const opts = { width: largura, align: 'justify', lineGap: 2 }
      doc.font('Helvetica').fontSize(10.5)
      // Reserva só a altura real do fecho: reservar a mais o empurrava sozinho para uma página nova.
      garantirEspaco(doc, doc.heightOfString(contrato.fecho, opts) + 8)
      doc.moveDown(0.5).text(contrato.fecho, MARGEM, doc.y, opts)
    }

    if (assinaturas) paginaDeAssinaturas(doc, largura, contrato, assinaturas)

    // Rodapé em todas as páginas, depois de saber quantas são.
    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      // Escrever abaixo da margem faria o pdfkit abrir página nova.
      doc.page.margins.bottom = 0
      const linhaHash = `Página ${i + 1} de ${count}  ·  Conteúdo SHA-256: ${contrato.conteudo_sha256}`
      if (!selo) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#666')
          .text(linhaHash, MARGEM, doc.page.height - MARGEM + 8, { width: largura, align: 'center', lineBreak: false })
        continue
      }
      const y = doc.page.height - MARGEM - QR + 10
      doc.save().moveTo(MARGEM, y - 8).lineTo(MARGEM + largura, y - 8).lineWidth(0.5).strokeColor('#ccc').stroke().restore()
      doc.image(selo.qrPng, MARGEM, y, { width: QR, height: QR })
      const x = MARGEM + QR + 10, w = largura - QR - 10
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#222')
        .text(`Documento assinado eletronicamente  ·  Código de verificação ${selo.codigo}`, x, y + 4, { width: w, lineBreak: false })
      doc.font('Helvetica').fontSize(7.5).fillColor('#444')
        .text(`Confira a autenticidade em ${selo.url} ou leia o QR ao lado.`, x, y + 17, { width: w, lineBreak: false })
      doc.fillColor('#777').text(linhaHash, x, y + 29, { width: w, lineBreak: false })
    }
    doc.end()
  })
}

function paginaDeAssinaturas(doc, largura, contrato, { signatarios, pdf_original_sha256 }) {
  doc.addPage()
  doc.font('Helvetica-Bold').fontSize(13).fillColor('black').text('PÁGINA DE ASSINATURAS', { align: 'center' })
  doc.moveDown(0.4)
  doc.font('Helvetica').fontSize(9).fillColor('#444').text(
    `Assinaturas eletrônicas do "${contrato.titulo}", colhidas pelo provedor de assinatura com autenticação por código ` +
    'de uso único enviado ao signatário. O texto assinado é o do documento original, identificado pelos códigos de integridade abaixo.',
    { align: 'justify', lineGap: 1.5 },
  )
  doc.moveDown(0.6)
  doc.font('Helvetica').fontSize(8).fillColor('#333')
    .text(`Conteúdo SHA-256: ${contrato.conteudo_sha256}`)
    .text(`PDF original SHA-256: ${pdf_original_sha256}`)
  doc.moveDown(1)

  for (const s of signatarios) {
    garantirEspaco(doc, 110)
    const y0 = doc.y
    doc.save().rect(MARGEM, y0, largura, 1).fill('#ccc').restore()
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('black').text(s.nome, MARGEM, doc.y, { width: largura })
    doc.font('Helvetica').fontSize(8.5).fillColor('#333')
    const linhas = [
      `${s.papel_rotulo}${s.cpf ? `  ·  CPF ${s.cpf}` : ''}  ·  ${s.email}`,
      `Assinou em ${dataHora(s.assinado_em)} (horário de Brasília)  ·  IP ${s.ip || '—'}`,
      `Autenticação: código de uso único por ${s.canal === 'email' ? 'e-mail' : s.canal}, validado em ${dataHora(s.identificado_em)}`,
      `Ciência individual de ${s.ciencias} cláusula(s) em destaque  ·  Nome digitado na assinatura: "${s.nome_digitado}"`,
    ]
    linhas.forEach(l => doc.text(l, MARGEM, doc.y, { width: largura }))
    doc.moveDown(0.8)
  }
}

export function dataHora(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(iso))
}

function garantirEspaco(doc, altura) {
  if (doc.y + altura > doc.page.height - doc.page.margins.bottom) doc.addPage()
}
