// Uma "ICP" de teste: raiz, AC intermediária e certificado de pessoa física
// com o CPF no campo oficial (OID 2.16.76.1.3.1), e uma assinatura PAdES por
// atualização incremental — como fazem Adobe e os assinadores das ACs.
//
// Serve para provar o verificador sem um certificado real. A raiz daqui NÃO
// é ICP-Brasil: nos testes, ela entra como raiz confiável por injeção.

import { createHash, webcrypto, X509Certificate } from 'node:crypto'
import { asn1js, pkijs } from '../src/plugaveis/cripto.js'

const { subtle } = webcrypto

const gerarChaves = () => subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])

function nome(campos) {
  const n = new pkijs.RelativeDistinguishedNames()
  for (const [type, value] of campos) n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type, value: new asn1js.Utf8String({ value }) }))
  return n
}

async function certificado({ serial, sujeito, emissor, chaves, chaveEmissor, ca = false, de, ate, cpf }) {
  const c = new pkijs.Certificate()
  c.version = 2
  c.serialNumber = new asn1js.Integer({ value: serial })
  c.issuer = nome(emissor)
  c.subject = nome(sujeito)
  c.notBefore.value = de
  c.notAfter.value = ate
  const bc = new pkijs.BasicConstraints({ cA: ca })
  c.extensions = [new pkijs.Extension({ extnID: '2.5.29.19', critical: true, extnValue: bc.toSchema().toBER(false), parsedValue: bc })]
  if (cpf) {
    // nascimento (8) + CPF (11) + PIS (11) + RG (15) + órgão/UF (6), como no DOC-ICP-04
    const conteudo = `01011980${cpf}${'0'.repeat(11)}${'0'.repeat(15)}SSPPB `
    // GeneralNames { otherName [0] { OID, [0] EXPLICIT OCTET STRING } }, como as ACs emitem
    const san = new asn1js.Sequence({
      value: [new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 },
        value: [
          new asn1js.ObjectIdentifier({ value: '2.16.76.1.3.1' }),
          new asn1js.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [new asn1js.OctetString({ valueHex: Buffer.from(conteudo, 'latin1') })] }),
        ],
      })],
    })
    c.extensions.push(new pkijs.Extension({ extnID: '2.5.29.17', extnValue: san.toBER(false) }))
  }
  await c.subjectPublicKeyInfo.importKey(chaves.publicKey)
  await c.sign(chaveEmissor, 'SHA-256')
  return c
}

const x509 = (c) => new X509Certificate(Buffer.from(c.toSchema().toBER(false)))

// Raiz → AC intermediária → titular. Datas relativas a `momento`.
export async function criarIcpDeTeste({ cpf = '52998224725', nomeTitular = 'JOAO DA SILVA EXEMPLO:52998224725', momento = new Date(), validadeTitular } = {}) {
  const dia = 864e5
  const raizChaves = await gerarChaves(), acChaves = await gerarChaves(), titularChaves = await gerarChaves()
  const RAIZ = [['2.5.4.6', 'BR'], ['2.5.4.10', 'ICP-Teste'], ['2.5.4.3', 'Autoridade Certificadora Raiz de Teste']]
  const AC = [['2.5.4.6', 'BR'], ['2.5.4.10', 'ICP-Teste'], ['2.5.4.3', 'AC Intermediaria de Teste']]
  const raiz = await certificado({ serial: 1, sujeito: RAIZ, emissor: RAIZ, chaves: raizChaves, chaveEmissor: raizChaves.privateKey, ca: true, de: new Date(momento - 3650 * dia), ate: new Date(+momento + 3650 * dia) })
  const ac = await certificado({ serial: 2, sujeito: AC, emissor: RAIZ, chaves: acChaves, chaveEmissor: raizChaves.privateKey, ca: true, de: new Date(momento - 1000 * dia), ate: new Date(+momento + 1000 * dia) })
  const titular = await certificado({
    serial: 3, sujeito: [['2.5.4.6', 'BR'], ['2.5.4.10', 'ICP-Teste'], ['2.5.4.3', nomeTitular]], emissor: AC,
    chaves: titularChaves, chaveEmissor: acChaves.privateKey, cpf,
    de: validadeTitular?.de || new Date(momento - 30 * dia), ate: validadeTitular?.ate || new Date(+momento + 365 * dia),
  })
  return { raiz, ac, titular, chave: titularChaves.privateKey, raizX509: x509(raiz) }
}

// Assina `original` como um assinador PAdES faz: acrescenta, depois do
// %%EOF, um dicionário /Sig com /ByteRange e /Contents (CMS destacado).
export async function assinarPdf(original, { titular, ac, chave, momento = new Date() }) {
  const RESERVA = 12000 // bytes do CMS (o hex ocupa o dobro)
  const marcador = '[0 ********** ********** **********]'
  const antes = Buffer.from(`\n1000 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange ${marcador} /Contents <`, 'latin1')
  const depois = Buffer.from(`> /M (D:20261016120000-03'00') >>\nendobj\n%%EOF\n`, 'latin1')
  const buf = Buffer.concat([original, antes, Buffer.alloc(RESERVA * 2, '0'), depois])
  const inicioContents = original.length + antes.length - 1 // posição do "<"
  const fimContents = inicioContents + 1 + RESERVA * 2 + 1 // depois do ">"
  const br = [0, inicioContents, fimContents, buf.length - fimContents]
  // Mesmo tamanho do marcador: "[0 " + três números em 10 posições.
  const brTexto = `[0 ${br.slice(1).map(n => String(n).padEnd(10, ' ')).join(' ')}]`
  if (brTexto.length !== marcador.length) throw new Error('ByteRange fora do tamanho reservado')
  buf.write(brTexto, buf.indexOf(marcador, original.length, 'latin1'), 'latin1')

  const assinados = Buffer.concat([buf.subarray(0, inicioContents), buf.subarray(fimContents)])
  const digest = createHash('sha256').update(assinados).digest()
  const cms = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: titular.issuer, serialNumber: titular.serialNumber }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({
        type: 0,
        attributes: [
          new pkijs.Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })] }),
          new pkijs.Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: digest })] }),
          new pkijs.Attribute({ type: '1.2.840.113549.1.9.5', values: [new asn1js.UTCTime({ valueDate: momento })] }),
        ],
      }),
    })],
    certificates: [titular, ac],
  })
  await cms.sign(chave, 0, 'SHA-256')
  const der = Buffer.from(new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: cms.toSchema(true) }).toSchema().toBER(false))
  if (der.length > RESERVA) throw new Error('CMS maior que o espaço reservado')
  buf.write(der.toString('hex'), inicioContents + 1, 'latin1')
  return buf
}
