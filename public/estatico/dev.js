// Painel de teste: usa a MESMA API /v1 que um cliente usaria, com a chave da
// organização de exemplo. Some em produção junto com a rota /dev.

import { $, api, baixar, dataHora, esc, mostrarErro } from './comum.js'

let estado = null
const v1 = (caminho, opts = {}) => api(`/v1${caminho}`, { ...opts, cabecalhos: { authorization: `Bearer ${estado.organizacao.api_key}` } })

const ROTULO = {
  gerado: 'gerado', enviado: 'aguardando assinaturas', parcialmente_assinado: 'assinado em parte',
  assinado: 'assinado', recusado: 'recusado', expirado: 'expirado', cancelado: 'cancelado',
}

async function carregar(primeira = false) {
  estado = await api('/dev/api/estado')
  $('#org').innerHTML = `Organização de teste: ${esc(estado.organizacao.nome.replace(/\.$/, ''))}. <a href="/painel">Painel</a>`
  if (primeira) {
    $('#exemplo').innerHTML = estado.exemplos.map(e => `<option value="${esc(e.nome)}">${esc(e.nome)}</option>`).join('')
    preencherSignatarios()
  }
  desenharContratos()
  desenharCaixa()
}

function signatariosSugeridos(ex) {
  const c = ex.dados.contratado || {}
  const quemAssinaPeloContratado = c.tipo === 'pj' ? c.representante_nome : c.nome
  return [
    { nome: 'Maria Exemplo Souza', email: 'maria.representante@clinica-exemplo.com.br', papel: 'representante' },
    { nome: quemAssinaPeloContratado || '', email: c.email || '', papel: c.tipo === 'pj' ? 'representante' : 'parte' },
  ]
}

function preencherSignatarios() {
  const ex = estado.exemplos.find(e => e.nome === $('#exemplo').value)
  $('#signatarios').innerHTML = ''
  signatariosSugeridos(ex).forEach(adicionarSignatario)
}

function adicionarSignatario(s = { nome: '', email: '', papel: 'parte' }) {
  const div = document.createElement('div')
  div.className = 'signatario-linha'
  div.innerHTML = `
    <label class="campo"><span class="sr">Nome</span><input name="nome" placeholder="Nome completo" value="${esc(s.nome)}" required></label>
    <label class="campo"><span class="sr">E-mail</span><input name="email" type="email" placeholder="E-mail" value="${esc(s.email)}" required></label>
    <input type="hidden" name="papel" value="${esc(s.papel)}">`
  $('#signatarios').append(div)
}

async function enviar(ev) {
  ev.preventDefault()
  const erro = $('#erro-enviar')
  erro.hidden = true
  const ex = estado.exemplos.find(e => e.nome === $('#exemplo').value)
  const signatarios = [...$('#signatarios').children].map(d => ({
    nome: d.querySelector('[name=nome]').value, email: d.querySelector('[name=email]').value, papel: d.querySelector('[name=papel]').value,
  })).filter(s => s.nome || s.email)
  try {
    const c = await v1('/contratos', { metodo: 'POST', corpo: { modelo: ex.modelo, dados: ex.dados } })
    await v1(`/contratos/${c.id}/enviar`, { metodo: 'POST', corpo: { signatarios, ordem: $('#ordem').value } })
    await carregar()
  } catch (e) {
    const lacunas = [...(e.detalhes?.faltando || []), ...(e.detalhes?.invalidos || [])]
    mostrarErro(erro, lacunas.length ? new Error(`${e.message} ${lacunas.map(l => `${l.rotulo}: ${l.motivo}`).join(' | ')}`) : e)
  }
}

function desenharContratos() {
  $('#contratos').innerHTML = estado.contratos.map(c => `
    <tr>
      <td>${esc(c.titulo)}<br><small>${esc(dataHora(c.criado_em))}</small></td>
      <td><span class="status ${esc(c.status)}">${esc(ROTULO[c.status] || c.status)}</span></td>
      <td class="acoes">
        <a href="#" data-arq="${c.id}" data-qual="original">PDF original</a>
        ${c.codigo_verificacao ? `<a href="#" data-arq="${c.id}" data-qual="final">PDF assinado</a><a href="/v/${esc(c.codigo_verificacao)}" target="_blank" rel="noopener">Selo</a>` : ''}
        <a href="#" data-dossie="${c.id}">Dossiê</a>
        ${['gerado', 'enviado', 'parcialmente_assinado'].includes(c.status) ? `<a href="#" data-cancelar="${c.id}">Cancelar</a>` : ''}
      </td>
    </tr>`).join('') || '<tr><td colspan="3">Nenhum contrato ainda. Gere o primeiro ao lado.</td></tr>'
}

function desenharCaixa() {
  $('#caixa').innerHTML = estado.caixa.map(m => {
    let destaque = ''
    if (m.meta.tipo === 'link') destaque = `<a href="${esc(m.meta.link)}" target="_blank" rel="noopener noreferrer">Abrir o link de assinatura</a>`
    if (m.meta.tipo === 'codigo') destaque = `<span class="codigo-grande">${esc(m.meta.codigo)}</span>`
    return `<div class="msg">
      <div class="assunto">${esc(m.assunto)}</div>
      <small>para ${esc(m.para)}, ${esc(dataHora(m.em))}</small>
      <div>${destaque}</div>
      <details><summary>Texto completo</summary><pre>${esc(m.texto)}</pre></details>
    </div>`
  }).join('') || '<p>Vazia. As mensagens aparecem aqui quando um contrato é enviado.</p>'
}

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-arq],[data-dossie],[data-cancelar]')
  if (!a) return
  e.preventDefault()
  try {
    if (a.dataset.arq) await baixar(await v1(`/contratos/${a.dataset.arq}/arquivo?qual=${a.dataset.qual}`), 'contrato.pdf')
    if (a.dataset.dossie) await baixar(await v1(`/contratos/${a.dataset.dossie}/dossie?formato=pdf`), 'dossie.pdf')
    if (a.dataset.cancelar) { await v1(`/contratos/${a.dataset.cancelar}/cancelar`, { metodo: 'POST', corpo: { motivo: 'cancelado no painel de teste' } }); await carregar() }
  } catch (er) { alert(er.message) }
})
$('#exemplo').addEventListener('change', preencherSignatarios)
$('#add-sig').addEventListener('click', () => adicionarSignatario())
$('#form-enviar').addEventListener('submit', enviar)

carregar(true)
setInterval(() => { if (!document.hidden) carregar().catch(() => {}) }, 3000)
