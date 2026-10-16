// Identidade dos PDFs: "fé pública". O documento assinado tem a linguagem do
// papel que não se falsifica (certidão, cheque): faixa de segurança na
// margem, roseta de guilhoché desenhada por fórmula, códigos em fonte de
// máquina. As telas usam outra identidade (bula + linguagem simples); o PDF é
// o que vai para a gaveta e para o processo, e precisa parecer oficial.

import { fileURLToPath } from 'node:url'

const fonte = (f) => fileURLToPath(new URL(`./fontes/${f}`, import.meta.url))

export const COR = {
  tinta: '#14223f',
  tinta2: '#4b5a74',
  tinta3: '#7d889c',
  verde: '#2f5d50',
  carimbo: '#b3261e',
  filete: '#c9d3df',
}

export function registrarFontes(doc) {
  doc.registerFont('titulo', fonte('CaslonDisplay.ttf'))
  doc.registerFont('serif', fonte('SourceSerif-Regular.ttf'))
  doc.registerFont('serif-forte', fonte('SourceSerif-SemiBold.ttf'))
  doc.registerFont('serif-italico', fonte('SourceSerif-Italic.ttf'))
  doc.registerFont('sans', fonte('PublicSans-Regular.ttf'))
  doc.registerFont('sans-forte', fonte('PublicSans-SemiBold.ttf'))
  doc.registerFont('mono', fonte('PlexMono-Regular.ttf'))
  doc.font('serif')
}

// Faixa de segurança: hachura fina na margem esquerda, em toda página.
export function faixaSeguranca(doc, { x = 30, largura = 7 } = {}) {
  const altura = doc.page.height
  doc.save().rect(x, 0, largura, altura).clip()
  doc.lineWidth(0.45).strokeColor(COR.verde).strokeOpacity(0.55)
  for (let y = -largura; y < altura; y += 3.2) doc.moveTo(x, y + largura).lineTo(x + largura, y)
  doc.stroke().restore()
}

// Roseta de guilhoché: epitrocoides sobrepostas, como nas cédulas. Desenha
// caminho grande, então só entra uma ou duas vezes por documento.
export function roseta(doc, cx, cy, raio, { cor = COR.verde, curvas = 9, opacidade = 0.5 } = {}) {
  doc.save().lineWidth(Math.max(0.25, raio / 220)).strokeColor(cor)
  for (let k = 0; k < curvas; k++) {
    const R = raio * (0.62 + k * 0.04), r = raio * 0.18, d = raio * (0.2 + k * 0.018)
    const s = raio / (R + r + d)
    doc.strokeOpacity(opacidade * (0.6 + (k % 3) * 0.2))
    for (let t = 0; t <= Math.PI * 14 + 0.001; t += 0.035) {
      const x = cx + ((R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t)) * s
      const y = cy + ((R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)) * s
      t === 0 ? doc.moveTo(x, y) : doc.lineTo(x, y)
    }
    doc.stroke()
  }
  doc.restore()
}

// Rótulo pequeno espaçado (número da cláusula, nome de seção).
export function rotulo(doc, texto, x, y, { cor = COR.carimbo, largura } = {}) {
  doc.font('sans-forte').fontSize(7.5).fillColor(cor)
    .text(texto.toUpperCase(), x, y, { width: largura, characterSpacing: 0.9 })
}
