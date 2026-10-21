// Diretório de partes: quem já recebeu um contrato desta organização
// (contratado, colaborador…), preenchido sozinho a cada contrato gerado.
// Serve para o próximo contrato da mesma pessoa não ser digitado do zero: o
// painel busca por nome, CPF, CNPJ ou e-mail e preenche o grupo inteiro.
//
// A identidade é o documento (CNPJ para PJ e MEI, CPF para PF) e, sem
// documento, o e-mail. Os dados guardados são os do ÚLTIMO contrato gerado
// (o mais recente é o mais certo); o que o contrato novo não trouxe continua
// do anterior. Ninguém edita o diretório à mão: ele é o reflexo dos contratos.

import { ErroNegocio } from './assinatura/servico.js'
import { TIPOS } from './motor/tipos.js'

const so = (v) => String(v ?? '').replace(/\D/g, '')
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Grupos de variáveis que descrevem uma parte (origem `parte` ou `fonte`):
// "contratado" na prestação de serviços, "colaborador" no termo. Aditivo e
// distrato não têm nenhum, e não mexem no diretório.
export function gruposDeParte(modelo) {
  return [...new Set((modelo.variaveis || []).filter(v => ['parte', 'fonte'].includes(v.origem)).map(v => v.chave.split('.')[0]))]
}

export function chaveDaParte(valores) {
  const cnpj = so(valores?.cnpj), cpf = so(valores?.cpf)
  if (cnpj.length === 14) return { tipo: 'cnpj', chave: cnpj }
  if (cpf.length === 11) return { tipo: 'cpf', chave: cpf }
  const email = String(valores?.email || '').trim().toLowerCase()
  if (email) return { tipo: 'email', chave: email }
  return null
}

export function criarPartes({ repo, agora = () => new Date() }) {
  function registrar({ organizacaoId, modelo, dados, contrato }) {
    const feitas = []
    for (const g of gruposDeParte(modelo)) {
      const valores = dados?.[g]
      if (!valores || typeof valores !== 'object' || !String(valores.nome || '').trim()) continue
      const id = chaveDaParte(valores)
      if (!id) continue
      const atual = repo.listar('partes', p => p.organizacao_id === organizacaoId && p.chave === id.chave)[0]
      const em = agora().toISOString()
      const base = {
        organizacao_id: organizacaoId, chave: id.chave, chave_tipo: id.tipo, grupo: g,
        tipo: valores.tipo || (id.tipo === 'cnpj' ? 'pj' : 'pf'),
        nome: String(valores.nome).trim(),
        cpf: so(valores.cpf) || null, cnpj: so(valores.cnpj) || null,
        email: valores.email ? String(valores.email).trim().toLowerCase() : null,
        dados: { ...(atual?.dados || {}), ...structuredClone(valores) },
        ultimo_modelo: modelo.chave, ultimo_contrato_id: contrato.id, ultimo_titulo: contrato.titulo, ultimo_em: em,
      }
      feitas.push(atual
        ? repo.atualizar('partes', atual.id, { ...base, contratos: (atual.contratos || 0) + 1, modelos: [...new Set([...(atual.modelos || []), modelo.chave])] })
        : repo.inserir('partes', { ...base, contratos: 1, modelos: [modelo.chave], criado_em: em }))
    }
    return feitas.map(publico)
  }

  // Busca por nome (sem acento, sem caixa), e-mail ou dígitos do documento.
  function listar(organizacaoId, { busca, limite = 50, pagina = 1 } = {}) {
    const lim = Math.min(Math.max(Number(limite) || 50, 1), 200)
    const pag = Math.max(Number(pagina) || 1, 1)
    const termo = norm(busca).trim()
    const digitos = so(busca)
    const todos = repo.listar('partes', p => p.organizacao_id === organizacaoId)
      .filter(p => !termo
        || norm(p.nome).includes(termo)
        || (p.email || '').includes(termo)
        || (digitos.length >= 3 && ((p.cpf || '').includes(digitos) || (p.cnpj || '').includes(digitos))))
      .sort((a, b) => String(b.ultimo_em).localeCompare(String(a.ultimo_em)))
    return { total: todos.length, pagina: pag, limite: lim, itens: todos.slice((pag - 1) * lim, pag * lim).map(publico) }
  }

  function obter(organizacaoId, id) {
    const p = repo.obter('partes', id)
    if (!p || p.organizacao_id !== organizacaoId) throw new ErroNegocio(404, 'Pessoa não encontrada no diretório.')
    return publico(p)
  }

  return { registrar, listar, obter }
}

function publico(p) {
  return {
    id: p.id, grupo: p.grupo, tipo: p.tipo, nome: p.nome,
    cpf: p.cpf ? TIPOS.cpf.formatar(p.cpf) : null,
    cnpj: p.cnpj ? TIPOS.cnpj.formatar(p.cnpj) : null,
    email: p.email, dados: p.dados, contratos: p.contratos, modelos: p.modelos,
    ultimo_modelo: p.ultimo_modelo, ultimo_contrato_id: p.ultimo_contrato_id, ultimo_titulo: p.ultimo_titulo, ultimo_em: p.ultimo_em,
    criado_em: p.criado_em,
  }
}
