// Pacote de prova: um .zip com tudo que um advogado ou perito precisa para
// conferir o contrato sem o nosso sistema. PDF assinado, PDF original,
// dossiê (PDF e JSON), carimbo do tempo, PDFs assinados com certificado e um
// LEIA-ME com os comandos de conferência. É o "a prova é do cliente" da
// VISION.md em um arquivo só. A exportação completa da organização
// (plataforma/exportacao.js) monta o mesmo conteúdo para cada contrato.

import archiver from 'archiver'
import { gerarDossiePdf } from './dossie-pdf.js'
import { dataHora } from '../motor/pdf.js'

export const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// Os arquivos do pacote de um contrato: [nome, Buffer][], com o LEIA-ME primeiro.
export async function montarPacote({ servico, contratoId, organizacaoId, baseUrl }) {
  const d = servico.dossie(contratoId, organizacaoId)
  const c = d.contrato
  const entradas = []
  const linhas = []

  const original = await servico.arquivo(contratoId, organizacaoId, 'original')
  if (original.buffer) { entradas.push(['contrato-original.pdf', original.buffer]); linhas.push(`- contrato-original.pdf: o texto enviado para assinatura, antes das assinaturas.\n  SHA-256 ${d.integridade.pdf_original_sha256}`) }

  if (d.integridade.pdf_final_sha256) {
    const final = await servico.arquivo(contratoId, organizacaoId, 'final')
    if (final.buffer) { entradas.unshift(['contrato-assinado.pdf', final.buffer]); linhas.unshift(`- contrato-assinado.pdf: a via final, com QR, código de verificação e página de assinaturas.\n  SHA-256 ${d.integridade.pdf_final_sha256}`) }
  }

  entradas.push(['dossie.pdf', await gerarDossiePdf(d)])
  entradas.push(['dossie.json', Buffer.from(JSON.stringify(d, null, 2))])
  linhas.push('- dossie.pdf e dossie.json: as evidências (identificação por código, ciência em cada cláusula em destaque, leitura até o fim, dúvidas e respostas, assinatura, IP e aparelho) e a trilha de eventos encadeada por hash. O PDF é para ler; o JSON é para conferir por programa.')

  const ct = d.integridade.carimbo_do_tempo
  if (ct?.gen_time) {
    try {
      const { buffer } = await servico.arquivoCarimbo(contratoId, organizacaoId)
      if (buffer) { entradas.push(['carimbo.tsr', buffer]); linhas.push(`- carimbo.tsr: carimbo do tempo RFC 3161 de ${ct.act}${ct.icp_brasil ? ' (ACT credenciada na ICP-Brasil)' : ' (ACT fora da ICP-Brasil: prova de terceiro, sem presunção legal)'}, aplicado em ${dataHora(ct.gen_time)} sobre o SHA-256 de contrato-assinado.pdf.`) }
    } catch { /* carimbo pendente: o dossiê diz */ }
  }

  for (const s of d.signatarios) {
    if (!s.evidencias?.certificado) continue
    try {
      const { buffer } = await servico.arquivoIcp(contratoId, organizacaoId, s.id)
      const nome = `assinatura-icp-${slug(s.nome)}.pdf`
      entradas.push([nome, buffer])
      linhas.push(`- ${nome}: o contrato assinado com certificado ICP-Brasil por ${s.nome} (${s.evidencias.certificado.nome}), byte a byte como foi enviado. SHA-256 ${s.evidencias.certificado.sha256}`)
    } catch { /* sem arquivo: o dossiê registra */ }
  }

  const url = c.codigo_verificacao ? `${baseUrl}/v/${c.codigo_verificacao}` : null
  const leiame = [
    `PACOTE DE PROVA`,
    `${c.titulo}`,
    `Emitente: ${c.organizacao}`,
    `Situação: ${c.status}${c.assinado_em ? ` · assinado por todos em ${dataHora(c.assinado_em)} (horário de Brasília)` : ''}`,
    c.codigo_verificacao ? `Código de verificação: ${c.codigo_verificacao}` : `Código de verificação: ainda não há (o contrato não foi concluído por todos).`,
    `Pacote gerado em ${dataHora(d.emitido_em)}.`,
    ``,
    `O QUE HÁ AQUI`,
    ...linhas,
    ``,
    `COMO CONFERIR SEM O SISTEMA`,
    `1. Integridade do arquivo: calcule o SHA-256 e compare com o deste LEIA-ME.`,
    `   Windows:  certutil -hashfile contrato-assinado.pdf SHA256`,
    `   Linux/macOS:  sha256sum contrato-assinado.pdf`,
    ct?.gen_time
      ? `2. Carimbo do tempo:  openssl ts -verify -data contrato-assinado.pdf -in carimbo.tsr -CAfile <cadeia de certificados da ACT>`
      : `2. Carimbo do tempo: não aplicado a este contrato; os horários são os do servidor do provedor.`,
    `3. Trilha de eventos: em dossie.json, cada evento traz "hash_anterior" (o hash do evento anterior) e "hash" (SHA-256 do próprio evento em JSON canônico, chaves em ordem, sem o campo "hash"). Alterar, remover ou reordenar um evento quebra a corrente dali em diante.`,
    url ? `4. Selo público: ${url} mostra a situação atual, quem assinou e os mesmos hashes, e confere qualquer PDF pelo navegador.` : `4. Selo público: existe só depois que todos assinam.`,
    `5. Certificado ICP-Brasil (se houver): valide também em https://validar.iti.gov.br — o sistema confere assinatura, cadeia e CPF, mas não consulta revogação.`,
    ``,
    `Base legal: MP 2.200-2/2001 art. 10 §2º (validade do meio eletrônico admitido pelas partes); CPC art. 784, III e §4º (título executivo, testemunhas dispensadas quando a integridade é conferida pelo provedor); CDC arts. 46 e 54 §4º (ciência prévia e destaque das cláusulas que limitam direito).`,
  ].join('\n')
  entradas.unshift(['LEIA-ME.txt', Buffer.from(leiame, 'utf8')])

  return { entradas, contrato: c, nome: `prova-${slug(c.titulo)}-${c.codigo_verificacao || c.id.slice(0, 8)}.zip` }
}

export async function gerarPacote(opts) {
  const { entradas, nome } = await montarPacote(opts)
  return { buffer: await zipar(entradas), nome }
}

export function zipar(entradas) {
  return new Promise((resolve, reject) => {
    const arq = archiver('zip', { zlib: { level: 6 } })
    const partes = []
    arq.on('data', b => partes.push(b))
    arq.on('error', reject)
    arq.on('end', () => resolve(Buffer.concat(partes)))
    for (const [nome, buffer] of entradas) arq.append(buffer, { name: nome })
    arq.finalize()
  })
}
