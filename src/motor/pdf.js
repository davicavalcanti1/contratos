// PDF do contrato montado. Cláusula crítica sai EM DESTAQUE (negrito + barra
// lateral): é a forma que o CDC art. 54 §4º pede para cláusula que limita
// direito, e a mesma marcação que a "bula" usa na tela de assinatura.
//
// O rodapé de cada página leva o hash do CONTEÚDO. O QR e o código de
// verificação entram na Fase 2, quando existir assinatura para verificar.

import { createHash } from 'node:crypto'
import PDFDocument from 'pdfkit'

const MARGEM = 64
const COR_DESTAQUE = '#1f3a5f'

export function gerarPdf(contrato) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM, bottom: MARGEM + 16, left: MARGEM, right: MARGEM },
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
      garantirEspaco(doc, 80)
      doc.moveDown(0.5).font('Helvetica').fontSize(10.5).text(contrato.fecho, MARGEM, doc.y, { width: largura, align: 'justify', lineGap: 2 })
    }

    // Rodapé em todas as páginas, depois de saber quantas são.
    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      // Escrever abaixo da margem faria o pdfkit abrir página nova.
      doc.page.margins.bottom = 0
      const y = doc.page.height - MARGEM + 8
      doc.font('Helvetica').fontSize(7.5).fillColor('#666')
        .text(`Página ${i + 1} de ${count}  ·  Conteúdo SHA-256: ${contrato.conteudo_sha256}`, MARGEM, y, {
          width: largura, align: 'center', lineBreak: false,
        })
    }
    doc.end()
  })
}

function garantirEspaco(doc, altura) {
  if (doc.y + altura > doc.page.height - doc.page.margins.bottom) doc.addPage()
}
