// Motor criptográfico do pkijs sobre o WebCrypto do Node. Um lugar só, para
// carimbo e ICP-Brasil usarem o mesmo.

import { X509Certificate, constants as cryptoConstants, createHash, verify as cryptoVerify, webcrypto } from 'node:crypto'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

const motor = new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto })
pkijs.setEngine('node', motor)

export { asn1js, pkijs, motor }

export const OID = {
  sha256: '2.16.840.1.101.3.4.2.1',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  subjectAltName: '2.5.29.17',
  // ICP-Brasil (DOC-ICP-04): dados do titular no "otherName" do SubjectAltName
  icpPessoaFisica: '2.16.76.1.3.1', // nascimento (8) + CPF (11) + PIS (11) + RG (15) + órgão/UF
  icpResponsavelPj: '2.16.76.1.3.4', // mesmo formato, do responsável pelo e-CNPJ
  icpCnpj: '2.16.76.1.3.3',
  icpNomeResponsavel: '2.16.76.1.3.2',
}

export function lerBer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const r = asn1js.fromBER(u8)
  if (r.offset === -1) throw new Error('estrutura ASN.1 inválida')
  return r.result
}

export const paraHex = (buf) => Buffer.from(buf).toString('hex')

const DIGESTS = {
  '2.16.840.1.101.3.4.2.1': 'sha256', '2.16.840.1.101.3.4.2.2': 'sha384', '2.16.840.1.101.3.4.2.3': 'sha512', '1.3.14.3.2.26': 'sha1',
}

// Verifica uma assinatura CMS (SignedData) sobre `conteudo`, do jeito que o
// carimbo RFC 3161 e o PAdES usam: o primeiro SignerInfo, com atributos
// assinados. Duas provas:
//   1. o atributo messageDigest é o hash do conteúdo  → o conteúdo é este;
//   2. a assinatura sobre os atributos confere com a chave do certificado
//      do signatário que está no próprio CMS        → foi ele que assinou.
// A CONFIANÇA no certificado (cadeia, ICP-Brasil) é outra pergunta, feita à parte.
export function verificarCms(signed, conteudo) {
  const si = signed.signerInfos?.[0]
  if (!si) return { ok: false, motivo: 'sem signatário no CMS' }
  const alg = DIGESTS[si.digestAlgorithm.algorithmId]
  if (!alg) return { ok: false, motivo: `algoritmo de hash não suportado (${si.digestAlgorithm.algorithmId})` }
  if (!si.signedAttrs) return { ok: false, motivo: 'assinatura sem atributos assinados' }

  const md = si.signedAttrs.attributes.find(a => a.type === OID.messageDigest)?.values[0]?.valueBlock.valueHexView
  if (!md) return { ok: false, motivo: 'sem messageDigest' }
  const calculado = createHash(alg).update(Buffer.from(conteudo)).digest()
  if (!Buffer.from(md).equals(calculado)) return { ok: false, motivo: 'o conteúdo não é o que foi assinado (hash diferente)' }

  const sid = si.sid
  const cert = (signed.certificates || []).find(c => c instanceof pkijs.Certificate &&
    (sid instanceof pkijs.IssuerAndSerialNumber
      ? Buffer.from(c.serialNumber.valueBlock.valueHexView).equals(Buffer.from(sid.serialNumber.valueBlock.valueHexView))
      : true))
  if (!cert) return { ok: false, motivo: 'o certificado de quem assinou não veio no CMS' }

  // Os atributos são assinados como SET (tag 0x31), não com a tag [0] implícita do CMS.
  const attrs = new Uint8Array(si.signedAttrs.encodedValue)
  attrs[0] = 0x31
  const chave = new X509Certificate(Buffer.from(cert.toSchema().toBER(false))).publicKey
  const sigAlg = si.signatureAlgorithm.algorithmId
  const pss = sigAlg === '1.2.840.113549.1.1.10'
  const ok = cryptoVerify(alg, attrs, pss ? { key: chave, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING } : chave, Buffer.from(si.signature.valueBlock.valueHexView))
  if (!ok) return { ok: false, motivo: 'a assinatura não confere com o certificado' }

  const st = si.signedAttrs.attributes.find(a => a.type === OID.signingTime)?.values[0]
  return { ok: true, certificado: cert, algoritmo: alg, signing_time: st?.toDate ? st.toDate().toISOString() : null }
}

// Nome distinto legível: "CN=Fulano, O=ICP-Brasil, C=BR".
const ROTULO_DN = { '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.8': 'ST', '2.5.4.7': 'L', '2.5.4.5': 'serialNumber' }
export function nomeDn(rdn) {
  return rdn.typesAndValues.map(t => `${ROTULO_DN[t.type] || t.type}=${t.value.valueBlock.value}`).join(', ')
}
export function campoDn(rdn, tipo) {
  return rdn.typesAndValues.find(t => t.type === tipo)?.value.valueBlock.value ?? null
}
