// Marca da organização nas telas públicas (assinatura e lote) e nos e-mails:
// nome de exibição, logotipo e cor de destaque. A casca continua branca
// (decisão de 16/out): a cor entra só onde hoje entra o azul de ação, e
// precisa ter contraste com branco, porque o botão tem texto branco.
//
// O logotipo vai para o mesmo armazenamento dos PDFs, com o nome derivado do
// conteúdo (trocar o arquivo = nome novo = cache nunca mostra o antigo).

import { createHash } from 'node:crypto'
import { ErroNegocio } from '../assinatura/servico.js'

export const LOGO_MAX = 300 * 1024
const TIPOS = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }
export const SEM_MARCA = Object.freeze({ nome: null, cor: null, logo_url: null })

// Pelo conteúdo, não pela extensão nem pelo content-type que o navegador diz.
export function detectarImagem(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  const inicio = buf.toString('utf8', 0, Math.min(buf.length, 1024)).replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(inicio)) return 'svg'
  return null
}

// Contraste WCAG entre a cor e o branco. Botão com texto branco pede 4,5.
export function contrasteComBranco(hex) {
  const n = parseInt(hex.slice(1), 16)
  const canal = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  return 1.05 / (L + 0.05)
}

export function marcaPublica(org) {
  const m = org?.marca
  if (!m) return SEM_MARCA
  return { nome: m.nome || null, cor: m.cor || null, logo_url: m.logo?.arquivo ? `/marca/${m.logo.arquivo}` : null }
}

export function criarMarca({ repo, auditar = () => {} }) {
  const org = (id) => {
    const o = repo.obter('organizacoes', id)
    if (!o) throw new ErroNegocio(404, 'Organização não encontrada.')
    return o
  }

  function definir(orgId, { nome, cor } = {}, ator) {
    const o = org(orgId)
    const marca = { ...(o.marca || {}) }
    if (nome !== undefined) {
      const n = String(nome || '').trim().replace(/\s+/g, ' ')
      if (n.length > 60) throw new ErroNegocio(400, 'O nome de exibição tem no máximo 60 caracteres.')
      marca.nome = n || null
    }
    if (cor !== undefined) {
      const c = String(cor || '').trim().toLowerCase()
      if (!c) marca.cor = null
      else {
        if (!/^#[0-9a-f]{6}$/.test(c)) throw new ErroNegocio(400, 'Cor no formato #rrggbb, como #1f6aa5.')
        if (contrasteComBranco(c) < 4.5) throw new ErroNegocio(400, 'Cor clara demais: o texto branco dos botões não daria para ler. Escolha um tom mais escuro.')
        marca.cor = c
      }
    }
    repo.atualizar('organizacoes', orgId, { marca })
    auditar(ator, 'marca.alterada', { organizacao_id: orgId, dados: { nome: marca.nome, cor: marca.cor } })
    return marcaPublica(repo.obter('organizacoes', orgId))
  }

  function definirLogo(orgId, buffer, ator) {
    const o = org(orgId)
    const buf = Buffer.from(buffer || [])
    if (!buf.length) throw new ErroNegocio(400, 'Envie o arquivo do logotipo.')
    if (buf.length > LOGO_MAX) throw new ErroNegocio(413, `Logotipo grande demais: até ${LOGO_MAX / 1024} KB.`)
    const ext = detectarImagem(buf)
    if (!ext) throw new ErroNegocio(400, 'O logotipo precisa ser PNG, JPG, WebP ou SVG.')
    // SVG é documento: nada de script, evento, iframe ou referência externa.
    if (ext === 'svg' && /<script|javascript:|\son\w+\s*=|<foreignObject|<iframe|href\s*=\s*["']?\s*(https?:|\/\/)/i.test(buf.toString('utf8'))) {
      throw new ErroNegocio(400, 'SVG com script, evento ou referência externa não é aceito. Exporte só o desenho.')
    }
    const sha = createHash('sha256').update(buf).digest('hex')
    const arquivo = `marca-${orgId}-${sha.slice(0, 16)}.${ext}`
    try { repo.salvarArquivo(arquivo, buf) } catch (e) { if (!/já existe/.test(e.message)) throw e }
    repo.atualizar('organizacoes', orgId, { marca: { ...(o.marca || {}), logo: { arquivo, tipo: TIPOS[ext], sha256: sha, bytes: buf.length } } })
    auditar(ator, 'marca.logo', { organizacao_id: orgId, dados: { arquivo, bytes: buf.length } })
    return marcaPublica(repo.obter('organizacoes', orgId))
  }

  function removerLogo(orgId, ator) {
    const o = org(orgId)
    const { logo, ...resto } = o.marca || {}
    repo.atualizar('organizacoes', orgId, { marca: resto })
    auditar(ator, 'marca.logo_removido', { organizacao_id: orgId, dados: { arquivo: logo?.arquivo || null } })
    return marcaPublica(repo.obter('organizacoes', orgId))
  }

  // O logotipo é público (quem tem o link de assinatura o vê), mas só os
  // arquivos com o nome da marca saem por aqui, nunca um PDF.
  async function arquivoLogo(nome) {
    const m = /^marca-[\w-]+-[0-9a-f]{16}\.(png|jpg|webp|svg)$/.exec(String(nome || ''))
    if (!m) return null
    const buffer = await repo.lerArquivo(nome)
    return buffer ? { buffer, tipo: TIPOS[m[1]] } : null
  }

  return { definir, definirLogo, removerLogo, arquivoLogo, publica: marcaPublica }
}
