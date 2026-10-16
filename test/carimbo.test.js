// Carimbo do tempo sem rede: uma ACT local que fala RFC 3161 de verdade (lê o
// pedido, devolve o nonce, assina o TSTInfo). A conversa com ACTs reais
// (FreeTSA, DigiCert) e a conferência no openssl estão em docs/PLUGAVEIS.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { asn1js, lerBer, pkijs } from '../src/plugaveis/cripto.js'
import { criarCarimbador, lerResposta } from '../src/plugaveis/carimbo.js'
import { criarIcpDeTeste } from './apoio-icp.js'

const { titular: certAct, chave: chaveAct } = await criarIcpDeTeste({ nomeTitular: 'ACT Local de Teste' })

// Responde um TimeStampReq como uma ACT: mesmo imprint, mesmo nonce, assinado.
async function actLocal(corpoPedido, { status = 0, trocarNonce = false, trocarImprint = false } = {}) {
  const req = new pkijs.TimeStampReq({ schema: lerBer(corpoPedido) })
  if (status !== 0) {
    return Buffer.from(new pkijs.TimeStampResp({ status: new pkijs.PKIStatusInfo({ status, statusStrings: [new asn1js.Utf8String({ value: 'pedido recusado' })] }) }).toSchema().toBER(false))
  }
  const imprint = trocarImprint ? new pkijs.MessageImprint({ hashAlgorithm: req.messageImprint.hashAlgorithm, hashedMessage: new asn1js.OctetString({ valueHex: randomBytes(32) }) }) : req.messageImprint
  const tst = new pkijs.TSTInfo({
    version: 1, policy: '1.2.3.4.1', messageImprint: imprint,
    serialNumber: new asn1js.Integer({ value: 4242 }), genTime: new Date('2026-10-16T21:00:00Z'),
    nonce: trocarNonce ? new asn1js.Integer({ value: 7 }) : req.nonce,
  })
  const tstDer = Buffer.from(tst.toSchema().toBER(false))
  const signed = new pkijs.SignedData({
    version: 3,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.9.16.1.4', eContent: new asn1js.OctetString({ valueHex: tstDer }) }),
    signerInfos: [new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: certAct.issuer, serialNumber: certAct.serialNumber }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({
        type: 0,
        attributes: [
          new pkijs.Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.9.16.1.4' })] }),
          new pkijs.Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: createHash('sha256').update(tstDer).digest() })] }),
        ],
      }),
    })],
    certificates: [certAct],
  })
  await signed.sign(chaveAct, 0, 'SHA-256')
  const token = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: signed.toSchema(true) })
  return Buffer.from(new pkijs.TimeStampResp({ status: new pkijs.PKIStatusInfo({ status: 0 }), timeStampToken: token }).toSchema().toBER(false))
}

const comAct = (opcoes) => criarCarimbador({
  url: 'https://act.local/tsr', nome: 'ACT Local',
  fetchFn: async (url, { body, headers }) => {
    assert.equal(headers['content-type'], 'application/timestamp-query')
    return new Response(await actLocal(body, opcoes), { status: 200, headers: { 'content-type': 'application/timestamp-reply' } })
  },
})
const hash = createHash('sha256').update('contrato').digest('hex')

test('carimba: imprint, data, série, ACT e token reverificável', async () => {
  const r = await comAct().carimbar(hash)
  assert.equal(r.hash, hash)
  assert.equal(r.gen_time, '2026-10-16T21:00:00.000Z')
  assert.equal(r.serial, '1092') // 4242 em hexadecimal
  assert.equal(r.politica, '1.2.3.4.1')
  assert.match(r.certificado_act, /ACT Local de Teste/)
  assert.equal(r.icp_brasil, false)
  const de_novo = await lerResposta(Buffer.from(r.token_base64, 'base64'), hash)
  assert.equal(de_novo.gen_time, r.gen_time)
})

test('recusa: ACT que nega, carimbo de outro documento, nonce trocado e token adulterado', async () => {
  await assert.rejects(comAct({ status: 2 }).carimbar(hash), /recusou o pedido.*pedido recusado/)
  await assert.rejects(comAct({ trocarImprint: true }).carimbar(hash), /outro documento/)
  await assert.rejects(comAct({ trocarNonce: true }).carimbar(hash), /outro nonce/)
  const bom = Buffer.from((await comAct().carimbar(hash)).token_base64, 'base64')
  const ruim = Buffer.from(bom)
  ruim[ruim.length - 30] ^= 1
  await assert.rejects(lerResposta(ruim, hash), /carimbo inválido/)
})

test('ACT fora do ar vira erro claro, e sem URL não há carimbador', async () => {
  const fora = criarCarimbador({ url: 'https://act.local/tsr', fetchFn: async () => { throw new Error('ECONNREFUSED') } })
  await assert.rejects(fora.carimbar(hash), e => e.status === 503 && /não respondeu/.test(e.message))
  assert.equal(criarCarimbador({}), null)
})
