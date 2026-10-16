// Assinatura com certificado ICP-Brasil (qualificada), por upload.
//
// Quem precisa assinar com certificado (escritório, cartório, contrato com o
// poder público) baixa o PDF do contrato, assina na ferramenta que já usa
// (Adobe com A1/A3, assinadores das ACs…) e envia o arquivo. O navegador não
// fala com token A3 sem plugin; o upload funciona com qualquer certificado.
//
// O que este módulo prova, e o que não:
//   ✔ a assinatura cobre o arquivo inteiro (nada foi acrescentado depois);
//   ✔ o arquivo assinado começa EXATAMENTE pelo contrato que enviamos — as
//     ferramentas PAdES assinam por atualização incremental, sem tocar no
//     original;
//   ✔ o CMS confere com a chave do certificado que ele traz;
//   ✔ a cadeia sobe até uma das raízes oficiais da ICP-Brasil (certs/icp-brasil);
//   ✔ o certificado estava válido no momento da assinatura;
//   ✔ CPF/CNPJ do titular, lidos dos campos próprios da ICP-Brasil (DOC-ICP-04);
//   ✘ revogação (LCR/OCSP) não é consultada aqui. A validação completa, com
//     revogação e política de assinatura, é a do validador oficial do ITI
//     (https://validar.iti.gov.br) — o dossiê aponta para ele.

import { X509Certificate } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OID, campoDn, lerBer, nomeDn, paraHex, pkijs, verificarCms } from './cripto.js'

const RAIZES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'certs', 'icp-brasil')
export const VALIDADOR_ITI = 'https://validar.iti.gov.br'

export function carregarRaizesOficiais(dir = RAIZES_DIR) {
  return readdirSync(dir).filter(f => /\.(crt|cer|der|pem)$/i.test(f)).map(f => new X509Certificate(readFileSync(join(dir, f))))
}

export function criarVerificadorIcp({ raizes = carregarRaizesOficiais(), agora = () => new Date() } = {}) {
  const digitaisRaizes = new Set(raizes.map(r => r.fingerprint256))

  async function verificar(pdf, { original } = {}) {
    const motivos = []
    const r = { valida: false, motivos }
    const assinatura = localizarAssinatura(pdf)
    if (!assinatura) { motivos.push('o arquivo não tem assinatura digital de PDF'); return r }
    const [a, b, c, d] = assinatura.byteRange

    // 1. Cobertura: [0 … <Contents> … fim do arquivo]
    r.cobre_arquivo_inteiro = a === 0 && c + d === pdf.length
    if (!r.cobre_arquivo_inteiro) motivos.push('há conteúdo no arquivo que a assinatura não cobre (alteração depois de assinar)')

    // 2. É o nosso contrato, intacto
    if (original) {
      r.contem_original = original.length <= b && pdf.subarray(0, original.length).equals(original)
      if (!r.contem_original) motivos.push('o arquivo assinado não é o contrato enviado sem alterações. Assine o PDF baixado daqui, sem editar nem "imprimir para PDF"')
    }

    // 3. CMS
    let signed
    try {
      const ci = new pkijs.ContentInfo({ schema: lerBer(assinatura.contents) })
      signed = new pkijs.SignedData({ schema: ci.content })
    } catch {
      motivos.push('a assinatura do PDF não pôde ser lida')
      return r
    }
    const assinados = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)])
    const cms = verificarCms(signed, assinados)
    r.criptografia_ok = cms.ok
    if (!cms.ok) { motivos.push(`assinatura inválida: ${cms.motivo}`); return r }

    // 4. Certificado e titular
    const cert = cms.certificado
    const x509 = new X509Certificate(Buffer.from(cert.toSchema().toBER(false)))
    r.assinado_em = cms.signing_time
    r.certificado = {
      titular: nomeDn(cert.subject),
      emissor: nomeDn(cert.issuer),
      nome: campoDn(cert.subject, '2.5.4.3'),
      serial: paraHex(cert.serialNumber.valueBlock.valueHexView),
      valido_de: new Date(x509.validFrom).toISOString(),
      valido_ate: new Date(x509.validTo).toISOString(),
      ...dadosIcp(cert),
    }
    const momento = cms.signing_time ? new Date(cms.signing_time) : agora()
    if (momento < new Date(x509.validFrom) || momento > new Date(x509.validTo)) motivos.push('o certificado não estava válido no momento da assinatura')

    // 5. Cadeia até uma raiz oficial
    const intermediarios = (signed.certificates || []).filter(x => x instanceof pkijs.Certificate).map(x => new X509Certificate(Buffer.from(x.toSchema().toBER(false))))
    const cadeia = montarCadeia(x509, [...intermediarios, ...raizes], momento)
    r.cadeia = cadeia.nomes
    r.icp_brasil = cadeia.ok && digitaisRaizes.has(cadeia.raiz?.fingerprint256)
    r.tipo_certificado = r.icp_brasil ? 'ICP-Brasil' : /Governo Federal/i.test(r.certificado.emissor + cadeia.nomes.join(' ')) ? 'gov.br' : 'outro'
    if (!cadeia.ok) motivos.push(`cadeia do certificado: ${cadeia.motivo}`)
    r.revogacao = `não consultada aqui; validação completa em ${VALIDADOR_ITI}`

    r.valida = motivos.length === 0
    return r
  }

  return { verificar, raizes: raizes.map(cn) }
}

// Última assinatura do arquivo: "/ByteRange [a b c d]" e o "/Contents <hex>"
// que fica exatamente entre b e c.
export function localizarAssinatura(pdf) {
  const texto = pdf.toString('latin1')
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  let m, ultimo = null
  while ((m = re.exec(texto))) ultimo = m
  if (!ultimo) return null
  const byteRange = ultimo.slice(1, 5).map(Number)
  const [, b, c] = byteRange
  if (c > pdf.length || b >= c) return null
  const trecho = texto.slice(b, c).trim()
  if (!trecho.startsWith('<') || !trecho.endsWith('>')) return null
  const hex = trecho.slice(1, -1).replace(/(00)+$/, '')
  return { byteRange, contents: Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex') }
}

// Sobe do certificado até uma raiz confiável conferindo, em cada degrau, que
// o emissor assinou o de baixo e que estava válido naquele momento.
function montarCadeia(folha, candidatos, momento) {
  const nomes = [cn(folha)]
  let atual = folha
  for (let i = 0; i < 8; i++) {
    const raiz = candidatos.find(r => r.fingerprint256 === atual.fingerprint256 && r.subject === r.issuer)
    if (raiz && atual.checkIssued(raiz) && atual.verify(raiz.publicKey)) return { ok: true, raiz, nomes }
    const emissor = candidatos.find(x => x.fingerprint256 !== atual.fingerprint256 && atual.checkIssued(x) && atual.verify(x.publicKey))
    if (!emissor) return { ok: false, nomes, motivo: `não chega a uma raiz da ICP-Brasil (para em "${cn(atual)}")` }
    if (momento < new Date(emissor.validFrom) || momento > new Date(emissor.validTo)) return { ok: false, nomes, motivo: `a AC "${cn(emissor)}" não estava válida no momento da assinatura` }
    nomes.push(cn(emissor))
    if (emissor.subject === emissor.issuer) {
      return candidatos.some(c => c.fingerprint256 === emissor.fingerprint256)
        ? { ok: true, raiz: emissor, nomes }
        : { ok: false, nomes, motivo: 'raiz desconhecida' }
    }
    atual = emissor
  }
  return { ok: false, nomes, motivo: 'cadeia longa demais' }
}

// CN de um nome em que cada campo é um RDN ("CN=…" numa linha) ou de um RDN com
// vários valores ("C=BR + O=… + CN=…") — as duas formas aparecem em certificados reais.
const cn = (x509) => x509.subject.match(/(?:^|[\n+]\s*)CN=([^\n+]+)/)?.[1].trim() || x509.subject

// DOC-ICP-04: os dados do titular ficam em "otherName" no SubjectAltName.
// Pessoa física (2.16.76.1.3.1): nascimento DDMMAAAA + CPF (11) + PIS + RG…
// e-CNPJ: CNPJ (2.16.76.1.3.3) e o responsável (2.16.76.1.3.4, mesmo formato).
export function dadosIcp(cert) {
  const ext = cert.extensions?.find(e => e.extnID === OID.subjectAltName)
  if (!ext) return {}
  // GeneralNames lido direto em ASN.1: otherName = [0] { OID, [0] EXPLICIT valor }.
  const nomes = lerBer(ext.extnValue.valueBlock.valueHexView).valueBlock.value || []
  const out = {}
  for (const gn of nomes) {
    if (gn.idBlock.tagClass !== 3 || gn.idBlock.tagNumber !== 0 || !Array.isArray(gn.valueBlock.value)) continue
    const [oid, valor] = gn.valueBlock.value
    const tipo = oid?.valueBlock?.toString?.()
    const texto = textoDe(valor)
    if (!texto) continue
    if (tipo === OID.icpPessoaFisica) { out.cpf = texto.slice(8, 19); out.nascimento = texto.slice(0, 8) }
    if (tipo === OID.icpResponsavelPj) out.cpf_responsavel = texto.slice(8, 19)
    if (tipo === OID.icpCnpj) out.cnpj = texto.slice(0, 14)
    if (tipo === OID.icpNomeResponsavel) out.nome_responsavel = texto
  }
  return out
}

// O valor vem embrulhado em [0] EXPLICIT, e dentro uma OCTET STRING ou
// uma string ASN.1 — depende da AC.
function textoDe(no) {
  let v = no
  while (v && v.valueBlock && Array.isArray(v.valueBlock.value) && v.valueBlock.value.length === 1) v = v.valueBlock.value[0]
  if (!v?.valueBlock) return null
  if (typeof v.valueBlock.value === 'string') return v.valueBlock.value
  if (v.valueBlock.valueHexView) return Buffer.from(v.valueBlock.valueHexView).toString('latin1')
  return null
}
