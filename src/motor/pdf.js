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
//
// Identidade visual em ./estilo-pdf.js.

import { createHash } from 'node:crypto'
import PDFDocument from 'pdfkit'
import { COR, faixaSeguranca, registrarFontes, roseta, rotulo } from './estilo-pdf.js'

const MARGEM = 64
const QR = 46

// `amostra`: texto para o rodapé no lugar do hash, quando o PDF é só o modelo
// (campos entre « »), sem valor de contrato.
export function gerarPdf(contrato, { selo = null, assinaturas = null, amostra = null } = {}) {
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
    registrarFontes(doc)

    const largura = doc.page.width - MARGEM * 2
    const larguraTitulo = largura - 110

    // Cabeçalho: roseta à direita, título em Caslon à esquerda, filete duplo.
    roseta(doc, MARGEM + largura - 38, MARGEM + 14, 52, { opacidade: 0.32 })
    doc.font('mono').fontSize(7).fillColor(COR.tinta2)
      .text(`Modelo ${contrato.modelo.chave} v${contrato.modelo.versao}`, MARGEM, MARGEM - 14, { width: larguraTitulo, lineBreak: false })
    doc.font('titulo').fontSize(24).fillColor(COR.tinta)
      .text(contrato.titulo, MARGEM, MARGEM, { width: larguraTitulo, lineGap: 1 })
    const yFilete = Math.max(doc.y, MARGEM + 58) + 8
    doc.save().lineWidth(0.6).strokeColor(COR.tinta)
      .moveTo(MARGEM, yFilete).lineTo(MARGEM + largura, yFilete).stroke()
      .lineWidth(0.3).moveTo(MARGEM, yFilete + 2.5).lineTo(MARGEM + largura, yFilete + 2.5).stroke().restore()
    doc.y = yFilete + 18

    if (contrato.preambulo) {
      doc.font('serif').fontSize(10.5).fillColor(COR.tinta)
        .text(contrato.preambulo, MARGEM, doc.y, { width: largura, align: 'justify', lineGap: 2 })
      doc.moveDown(0.8)
    }

    for (const c of contrato.clausulas) {
      garantirEspaco(doc, 70)
      doc.moveDown(0.3)
      rotulo(doc, `Cláusula ${c.numero}${c.critica ? '  ·  em destaque' : ''}${c.nota ? `  ·  ${c.nota}` : ''}`, MARGEM, doc.y, { largura })
      doc.moveDown(0.15)
      doc.font('serif-forte').fontSize(11.5).fillColor(COR.tinta).text(c.titulo, MARGEM, doc.y, { width: largura })
      doc.moveDown(0.35)

      for (const p of c.paragrafos) {
        const texto = `${p.numero}. ${p.texto}`
        const opts = { width: largura - (c.critica ? 11 : 0), align: 'justify', lineGap: 2 }
        doc.font(c.critica ? 'serif-forte' : 'serif').fontSize(10.5)
        const altura = doc.heightOfString(texto, opts)
        garantirEspaco(doc, Math.min(altura, 200))
        const y = doc.y
        if (c.critica) {
          doc.save().rect(MARGEM, y + 1, 2.2, altura - 2).fill(COR.tinta).restore()
          doc.fillColor(COR.tinta).text(texto, MARGEM + 11, y, opts)
        } else {
          doc.fillColor(COR.tinta).text(texto, MARGEM, y, opts)
        }
        doc.moveDown(0.5)
      }
      doc.moveDown(0.4)
    }

    if (contrato.fecho) {
      const opts = { width: largura, align: 'justify', lineGap: 2 }
      doc.font('serif').fontSize(10.5).fillColor(COR.tinta)
      // Reserva só a altura real do fecho: reservar a mais o empurrava sozinho para uma página nova.
      garantirEspaco(doc, doc.heightOfString(contrato.fecho, opts) + 8)
      doc.moveDown(0.5).text(contrato.fecho, MARGEM, doc.y, opts)
    }

    if (assinaturas) paginaDeAssinaturas(doc, largura, contrato, assinaturas, selo)

    // Rodapé e faixa de segurança em todas as páginas, depois de saber quantas são.
    const { start, count } = doc.bufferedPageRange()
    for (let i = start; i < start + count; i++) {
      doc.switchToPage(i)
      // Escrever abaixo da margem faria o pdfkit abrir página nova.
      doc.page.margins.bottom = 0
      faixaSeguranca(doc)
      const linhaHash = amostra ? `Página ${i + 1} de ${count}  ·  ${amostra}` : `Página ${i + 1} de ${count}  ·  Conteúdo SHA-256 ${contrato.conteudo_sha256}`
      if (!selo) {
        doc.font('mono').fontSize(6.5).fillColor(COR.tinta3)
          .text(linhaHash, MARGEM, doc.page.height - MARGEM + 8, { width: largura, align: 'center', lineBreak: false })
        continue
      }
      const y = doc.page.height - MARGEM - QR + 10
      doc.save().moveTo(MARGEM, y - 8).lineTo(MARGEM + largura, y - 8).lineWidth(0.5).strokeColor(COR.filete).stroke().restore()
      doc.image(selo.qrPng, MARGEM, y, { width: QR, height: QR })
      const x = MARGEM + QR + 10, w = largura - QR - 10
      doc.font('sans-forte').fontSize(8).fillColor(COR.tinta)
        .text('Documento assinado eletronicamente  ·  código ', x, y + 3, { width: w, lineBreak: false, continued: true })
        .font('mono').fontSize(8.5).fillColor(COR.carimbo).text(selo.codigo, { lineBreak: false })
      doc.font('sans').fontSize(7.5).fillColor(COR.tinta2)
        .text(`Confira a autenticidade em ${selo.url} ou leia o QR ao lado.`, x, y + 17, { width: w, lineBreak: false })
      doc.font('mono').fontSize(6.5).fillColor(COR.tinta3).text(linhaHash, x, y + 30, { width: w, lineBreak: false })
    }
    doc.end()
  })
}

function paginaDeAssinaturas(doc, largura, contrato, { signatarios, pdf_original_sha256 }, selo) {
  doc.addPage()
  const larguraTitulo = largura - 110
  roseta(doc, MARGEM + largura - 38, MARGEM + 14, 52, { cor: COR.carimbo, opacidade: 0.38 })
  rotulo(doc, 'Página de assinaturas', MARGEM, MARGEM - 12, { largura: larguraTitulo })
  doc.font('titulo').fontSize(22).fillColor(COR.tinta).text('Assinaturas', MARGEM, MARGEM + 2, { width: larguraTitulo })
  if (selo) doc.font('mono').fontSize(10).fillColor(COR.carimbo).text(selo.codigo, MARGEM, doc.y + 2, { width: larguraTitulo })
  doc.y = Math.max(doc.y, MARGEM + 70) + 6
  doc.font('serif').fontSize(9.5).fillColor(COR.tinta2).text(
    `Assinaturas eletrônicas do "${contrato.titulo}", colhidas pelo provedor de assinatura com autenticação por código ` +
    'de uso único enviado ao signatário. O texto assinado é o do documento original, identificado pelos códigos de integridade abaixo.',
    MARGEM, doc.y, { width: largura, align: 'justify', lineGap: 1.5 },
  )
  doc.moveDown(0.6)
  doc.font('mono').fontSize(7).fillColor(COR.tinta2)
    .text(`Conteúdo SHA-256      ${contrato.conteudo_sha256}`, { width: largura })
    .text(`PDF original SHA-256  ${pdf_original_sha256}`, { width: largura })
  doc.moveDown(1)

  for (const s of signatarios) {
    garantirEspaco(doc, 110)
    const y0 = doc.y
    doc.save().rect(MARGEM, y0, largura, 0.6).fill(COR.filete).restore()
    doc.y = y0 + 10
    rotulo(doc, s.papel_rotulo, MARGEM, doc.y, { largura, cor: COR.verde })
    doc.font('serif-forte').fontSize(12).fillColor(COR.tinta).text(s.nome, MARGEM, doc.y + 1, { width: largura })
    doc.moveDown(0.2)
    doc.font('sans').fontSize(8.5).fillColor(COR.tinta2)
    const linhas = [
      `${s.cpf ? `CPF ${s.cpf}  ·  ` : ''}${s.email}`,
      `Assinou em ${dataHora(s.assinado_em)} (horário de Brasília)  ·  IP ${s.ip || '—'}`,
      ...(s.certificado
        ? [
            `Assinatura digital com certificado ICP-Brasil de ${s.certificado.nome}, emitido por ${(s.certificado.emissor.match(/CN=([^,]+)/) || [])[1] || s.certificado.emissor}, série ${s.certificado.serial}`,
            `Cadeia até ${s.certificado.cadeia.at(-1)}  ·  arquivo assinado guardado no dossiê (SHA-256 ${s.certificado.sha256.slice(0, 16)}…)  ·  ciência de ${s.ciencias} cláusula(s) em destaque`,
          ]
        : [
            `Autenticação: código de uso único por ${s.canal === 'email' ? 'e-mail' : s.canal}, validado em ${dataHora(s.identificado_em)}`,
            `Ciência individual de ${s.ciencias} cláusula(s) em destaque  ·  Nome digitado na assinatura: "${s.nome_digitado}"`,
          ]),
    ]
    linhas.forEach(l => doc.text(l, MARGEM, doc.y, { width: largura, lineGap: 1 }))
    doc.moveDown(0.9)
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
