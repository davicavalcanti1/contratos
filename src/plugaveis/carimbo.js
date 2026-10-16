// Carimbo do tempo (RFC 3161). Uma Autoridade de Carimbo do Tempo (ACT)
// assina "este hash existia neste instante". Sem ele, os horários do dossiê
// são os do nosso servidor; com ele, são de um terceiro — e, se a ACT for
// credenciada na ICP-Brasil, com presunção legal (MP 2.200-2).
//
// O que se carimba é o SHA-256 do PDF FINAL (o assinado, com o QR e a página
// de assinaturas). Assim, qualquer perito confere sem depender de nós:
//
//   openssl ts -verify -data contrato-assinado.pdf -in carimbo.tsr -CAfile <cadeia da ACT>
//
// Configuração (variáveis de ambiente):
//   CARIMBO_URL          endereço RFC 3161 da ACT
//   CARIMBO_NOME         nome para mostrar ("ACT Serpro", "FreeTSA"…)
//   CARIMBO_ICP_BRASIL=1 só se a ACT for credenciada na ICP-Brasil
//   CARIMBO_USUARIO / CARIMBO_SENHA   se a ACT exigir autenticação básica

import { randomBytes } from 'node:crypto'
import { ErroNegocio } from '../assinatura/servico.js'
import { OID, asn1js, lerBer, nomeDn, paraHex, pkijs, verificarCms } from './cripto.js'

export function criarCarimbador({ url, nome, icpBrasil = false, usuario, senha, fetchFn = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!url) return null

  async function carimbar(hashHex) {
    const hash = Buffer.from(hashHex, 'hex')
    if (hash.length !== 32) throw new Error('o carimbo espera um SHA-256')
    const nonce = randomBytes(8)
    const req = new pkijs.TimeStampReq({
      version: 1,
      messageImprint: new pkijs.MessageImprint({
        hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID.sha256 }),
        hashedMessage: new asn1js.OctetString({ valueHex: hash }),
      }),
      nonce: new asn1js.Integer({ valueHex: nonce }),
      certReq: true, // a resposta traz o certificado da ACT: o token se verifica sozinho
    })
    const corpo = Buffer.from(req.toSchema().toBER(false))

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    let resposta
    try {
      const r = await fetchFn(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/timestamp-query',
          accept: 'application/timestamp-reply',
          ...(usuario ? { authorization: `Basic ${Buffer.from(`${usuario}:${senha || ''}`).toString('base64')}` } : {}),
        },
        body: corpo,
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      resposta = Buffer.from(await r.arrayBuffer())
    } catch (e) {
      throw new ErroNegocio(503, `A ACT ${nome || url} não respondeu (${e.name === 'AbortError' ? 'tempo esgotado' : e.message}).`)
    } finally { clearTimeout(t) }

    const info = await lerResposta(resposta, hashHex)
    // O nonce volta igual: a resposta é para ESTE pedido, não uma reprodução.
    if (info.nonce && info.nonce !== paraHex(nonce).replace(/^0+/, '')) throw new Error('a ACT devolveu outro nonce')
    return {
      ...info,
      act: nome || new URL(url).host,
      url,
      icp_brasil: !!icpBrasil,
      token_base64: resposta.toString('base64'),
    }
  }

  return { carimbar, nome: nome || url, icpBrasil: !!icpBrasil }
}

// Lê e CONFERE uma resposta RFC 3161: status concedido, imprint igual ao hash
// pedido e assinatura da ACT válida. Usado ao carimbar e ao verificar depois.
export async function lerResposta(der, hashHex) {
  const resp = new pkijs.TimeStampResp({ schema: lerBer(der) })
  const status = resp.status.status
  if (status !== 0 && status !== 1) {
    const motivo = resp.status.statusStrings?.map(s => s.valueBlock.value).join('; ')
    throw new Error(`a ACT recusou o pedido (status ${status}${motivo ? `: ${motivo}` : ''})`)
  }
  const signed = new pkijs.SignedData({ schema: resp.timeStampToken.content })
  if (signed.encapContentInfo.eContentType !== OID.tstInfo) throw new Error('o token não é um TSTInfo')
  const tstDer = octetos(signed.encapContentInfo.eContent)
  const tst = new pkijs.TSTInfo({ schema: lerBer(tstDer) })

  const imprint = paraHex(tst.messageImprint.hashedMessage.valueBlock.valueHexView)
  if (imprint !== String(hashHex).toLowerCase()) throw new Error('o carimbo é de outro documento (hash diferente)')

  // A confiança na ACT vem da configuração (ou da cadeia ICP-Brasil, conferida
  // por quem valida o .tsr); aqui se prova que o token não foi alterado e foi
  // assinado pelo certificado que ele mesmo traz.
  const v = verificarCms(signed, tstDer)
  if (!v.ok) throw new Error(`carimbo inválido: ${v.motivo}`)
  const certAct = v.certificado
  return {
    gen_time: tst.genTime.toISOString(),
    serial: paraHex(tst.serialNumber.valueBlock.valueHexView),
    politica: tst.policy,
    hash_algoritmo: 'SHA-256',
    hash: imprint,
    nonce: tst.nonce ? paraHex(tst.nonce.valueBlock.valueHexView).replace(/^0+/, '') : null,
    certificado_act: certAct ? nomeDn(certAct.subject) : null,
  }
}

export function carimbadorDoAmbiente(env = process.env, { producao = false } = {}) {
  if (env.CARIMBO_URL) {
    return criarCarimbador({
      url: env.CARIMBO_URL, nome: env.CARIMBO_NOME, icpBrasil: env.CARIMBO_ICP_BRASIL === '1',
      usuario: env.CARIMBO_USUARIO, senha: env.CARIMBO_SENHA,
    })
  }
  // Fora de produção, uma ACT pública e gratuita para ver o fluxo funcionando.
  // NÃO é ICP-Brasil, e o dossiê diz isso.
  if (!producao && env.CARIMBO_URL !== '') return criarCarimbador({ url: 'https://freetsa.org/tsr', nome: 'FreeTSA (teste)' })
  return null
}

// Em BER, uma OCTET STRING pode vir "construída" (em pedaços). Algumas ACTs
// mandam assim; juntar os pedaços dá o mesmo conteúdo da forma simples.
function octetos(no) {
  if (!no.idBlock.isConstructed) return Buffer.from(no.valueBlock.valueHexView)
  return Buffer.concat(no.valueBlock.value.map(octetos))
}
