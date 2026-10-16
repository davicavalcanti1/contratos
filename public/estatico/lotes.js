// Fluxo do RH: planilha → colunas → conferir → acompanhar. Usa a API /v1 com
// a chave da organização de teste (o painel de verdade é a Fase 4).

import { $, api, baixar, dataHora, esc, mostrarErro } from './comum.js'

let chave = null
let modelos = []
let planilha = null      // { planilha_id, colunas, amostra, total, nome_arquivo }
let sugestao = null      // { mapeamento, variaveis, origem }
let previaAtual = null
let loteAtual = null
let pollLote = null

const v1 = (c, o = {}) => api(`/v1${c}`, { ...o, cabecalhos: { authorization: `Bearer ${chave}`, ...(o.cabecalhos || {}) } })
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

const PASSOS = ['planilha', 'colunas', 'conferir', 'acompanhar']
function ir(passo) {
  for (const p of PASSOS) $(`#passo-${p}`).hidden = p !== passo
  const idx = PASSOS.indexOf(passo)
  for (const li of $('#etapas').children) {
    const i = PASSOS.indexOf(li.dataset.etapa)
    if (i === idx) li.setAttribute('aria-current', 'step')
    else li.removeAttribute('aria-current')
    li.classList.toggle('feita', i < idx)
  }
  $('#erro').hidden = true
  clearInterval(pollLote)
  window.scrollTo({ top: 0 })
}
const erro = (e) => { mostrarErro($('#erro'), e); window.scrollTo({ top: 0 }) }

async function iniciar() {
  const est = await api('/dev/api/estado')
  chave = est.organizacao.api_key
  $('#org').innerHTML = `Organização de teste: ${esc(est.organizacao.nome.replace(/\.$/, ''))}. Painel só fora de produção. <a href="/dev">Contrato avulso</a>`
  modelos = await v1('/modelos')
  $('#modelo').innerHTML = modelos.map(m => `<option value="${esc(m.chave)}">${esc(m.titulo)}</option>`).join('')
  // O termo do colaborador é o caso típico de lote: começa nele.
  if (modelos.some(m => m.chave === 'termo_confidencialidade_colaborador')) $('#modelo').value = 'termo_confidencialidade_colaborador'
  descreverModelo()
  await listar()
  ir('planilha')
}

function descreverModelo() {
  $('#modelo-desc').textContent = modelos.find(m => m.chave === $('#modelo').value)?.descricao || ''
}

async function listar() {
  const lotes = await v1('/lotes')
  $('#lista').innerHTML = lotes.map(l => `
    <tr><td><a href="#" data-lote="${l.id}">${esc(l.nome)}</a><br><small>${esc(l.modelo)}, ${esc(dataHora(l.criado_em))}</small></td>
    <td>${l.totais.assinados} de ${plural(l.totais.contratos, 'contrato assinado', 'contratos assinados')}</td></tr>`).join('')
    || '<tr><td>Nenhum lote ainda.</td></tr>'
}

// ── 1. Planilha ─────────────────────────────────────────────────────────────
async function lerPlanilha(ev) {
  ev.preventDefault()
  const f = $('#arquivo').files[0]
  if (!f) return
  // O arquivo vai cru (o helper `api` só manda JSON).
  try {
    const r = await fetch(`/v1/lotes/planilha?nome=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/octet-stream' }, body: f })
    const corpo = await r.json()
    if (!r.ok) throw new Error(corpo.erro)
    planilha = corpo
    sugestao = await v1(`/lotes/planilha/${planilha.planilha_id}/sugestao?modelo=${encodeURIComponent($('#modelo').value)}`)
    desenharMapa()
    ir('colunas')
  } catch (e) { erro(e) }
}

// ── 2. Colunas ──────────────────────────────────────────────────────────────
function desenharMapa() {
  $('#colunas-origem').textContent = `${planilha.nome_arquivo}: ${plural(planilha.total, 'linha', 'linhas')}, ${plural(planilha.colunas.length, 'coluna', 'colunas')}. ` +
    (sugestao.origem === 'salvo' ? 'Usei o mesmo mapeamento do último lote com estas colunas.' : 'Sugeri pela semelhança dos nomes; confira antes de seguir.')
  const opcoesColuna = (sel) => planilha.colunas.map(c => `<option value="col:${esc(c)}"${sel === c ? ' selected' : ''}>Coluna "${esc(c)}"</option>`).join('')
  $('#mapa').innerHTML = sugestao.variaveis.map(v => {
    const m = sugestao.mapeamento[v.chave]
    const fixo = m && 'valor' in m
    const padrao = v.padrao !== undefined ? `Não usar (padrão: ${v.opcoes?.find(o => o.valor === v.padrao)?.texto ?? v.padrao})` : 'Não usar'
    const obrig = v.obrigatoria !== false && v.padrao === undefined
    return `
      <tr data-var="${esc(v.chave)}">
        <td>${esc(v.rotulo)}${obrig ? ' <span class="obrig" title="Necessário quando entra no contrato">*</span>' : ''}</td>
        <td>
          <select class="fonte">
            <option value="">${esc(padrao)}</option>
            ${opcoesColuna(m?.coluna)}
            <option value="fixo"${fixo ? ' selected' : ''}>O mesmo valor para todos…</option>
          </select>
          ${campoFixo(v, fixo ? m.valor : '', !fixo)}
        </td>
        <td class="amostra"></td>
      </tr>`
  }).join('')
  document.querySelectorAll('#mapa tr').forEach(atualizarAmostra)
}

function campoFixo(v, valor, oculto) {
  if (v.tipo === 'enum') {
    return `<select class="fixo"${oculto ? ' hidden' : ''}>${v.opcoes.map(o => `<option value="${esc(o.valor)}"${o.valor === valor ? ' selected' : ''}>${esc(o.texto)}</option>`).join('')}</select>`
  }
  return `<input class="fixo" value="${esc(valor)}" placeholder="Valor para todas as linhas"${oculto ? ' hidden' : ''}>`
}

function atualizarAmostra(tr) {
  const sel = tr.querySelector('.fonte').value
  tr.querySelector('.fixo').hidden = sel !== 'fixo'
  tr.querySelector('.amostra').textContent = sel.startsWith('col:') ? (planilha.amostra[0]?.valores[sel.slice(4)] || '(vazio)') : ''
}

function lerMapa() {
  const m = {}
  for (const tr of document.querySelectorAll('#mapa tr')) {
    const sel = tr.querySelector('.fonte').value
    m[tr.dataset.var] = sel.startsWith('col:') ? { coluna: sel.slice(4) } : sel === 'fixo' ? { valor: tr.querySelector('.fixo').value } : null
  }
  return m
}

// ── 3. Conferir ─────────────────────────────────────────────────────────────
async function conferir() {
  try {
    sugestao.mapeamento = lerMapa()
    previaAtual = await v1('/lotes/previa', { metodo: 'POST', corpo: { planilha_id: planilha.planilha_id, modelo: $('#modelo').value, mapeamento: sugestao.mapeamento } })
    desenharPrevia()
    ir('conferir')
  } catch (e) { erro(e) }
}

function desenharPrevia() {
  const p = previaAtual
  $('#totais-previa').innerHTML = `
    <div class="ok"><strong>${p.prontas}</strong>prontas para enviar</div>
    <div class="${p.com_problema ? 'mal' : ''}"><strong>${p.com_problema}</strong>com problema, ficam de fora</div>`
  $('#aviso-org').innerHTML = p.cadastro_da_organizacao_incompleto.length
    ? `<p class="aviso erro">O cadastro da empresa está sem: ${esc(p.cadastro_da_organizacao_incompleto.join(', '))}. Nenhum contrato sai até isso ser preenchido.</p>` : ''
  const cols = p.linhas[0]?.resumo.map(r => r.rotulo) || []
  $('#previa').innerHTML = `
    <thead><tr><th>Linha</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Assina</th><th>Situação</th></tr></thead>
    <tbody>${p.linhas.map(l => `
      <tr class="${l.ok ? '' : 'linha-problema'}">
        <td>${l.numero}</td>
        ${l.resumo.map(r => `<td>${esc(r.valor)}</td>`).join('')}
        <td>${l.quem_assina.map(s => `${esc(s.nome)}<br><small>${esc(s.email)}</small>`).join('<br>')}</td>
        <td>${l.problemas.length ? `<ul class="lista-curta">${l.problemas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : 'pronta'}
            ${l.avisos.length ? `<ul class="lista-curta avisos">${l.avisos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</td>
      </tr>`).join('')}</tbody>`
  const n = p.cadastro_da_organizacao_incompleto.length ? 0 : p.prontas
  $('#btn-enviar').disabled = !n
  $('#btn-enviar').textContent = n ? `Gerar e enviar ${plural(n, 'contrato', 'contratos')}` : 'Nenhuma linha pronta'
  if (!$('#nome-lote').value) $('#nome-lote').value = `${modelos.find(m => m.chave === $('#modelo').value)?.titulo || 'Lote'}, ${new Date().toLocaleDateString('pt-BR')}`
}

async function enviar(ev) {
  ev.preventDefault()
  const b = $('#btn-enviar'), t = b.textContent
  b.disabled = true
  b.textContent = 'Gerando os contratos…'
  try {
    const rep = { nome: $('#rep-nome').value.trim(), email: $('#rep-email').value.trim() }
    loteAtual = await v1('/lotes', {
      metodo: 'POST',
      corpo: {
        planilha_id: planilha.planilha_id, modelo: $('#modelo').value, mapeamento: sugestao.mapeamento,
        nome: $('#nome-lote').value, assinante_organizacao: rep.nome || rep.email ? rep : null,
      },
    })
    acompanhar(loteAtual)
  } catch (e) { erro(e) } finally { b.disabled = false; b.textContent = t }
}

// ── 4. Acompanhar ───────────────────────────────────────────────────────────
const SIT = {
  nao_gerado: 'não gerado', enviado: 'aguardando', parcialmente_assinado: 'assinado em parte',
  assinado: 'assinado', recusado: 'recusado', expirado: 'expirado', cancelado: 'cancelado',
}
const PESSOA = { notificado: 'não abriu', identificado: 'lendo', assinado: 'assinou', recusado: 'recusou', aguardando: 'aguardando' }

function acompanhar(l) {
  ir('acompanhar')
  desenharLote(l)
  pollLote = setInterval(async () => {
    if (document.hidden) return
    try { desenharLote(loteAtual = await v1(`/lotes/${loteAtual.id}`)) } catch {}
  }, 4000)
  listar().catch(() => {})
}

// Quem volta para a aba vê o estado de agora, sem esperar o próximo ciclo.
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !loteAtual || $('#passo-acompanhar').hidden) return
  try { desenharLote(loteAtual = await v1(`/lotes/${loteAtual.id}`)) } catch {}
})

function desenharLote(l) {
  $('#lote-nome').textContent = l.nome
  $('#lote-sub').textContent = `${l.modelo}, a partir de ${l.nome_arquivo}, ${dataHora(l.criado_em)}.` +
    (l.assinante ? ` Pela empresa: ${l.assinante.nome}, ${l.assinante.status === 'assinado' ? 'já assinou' : 'ainda não assinou'}.` : '')
  const t = l.totais
  $('#totais-lote').innerHTML = `
    <div class="ok"><strong>${t.assinados} de ${t.contratos}</strong>contratos assinados por todos</div>
    <div><strong>${t.aguardando}</strong>aguardando</div>
    ${t.recusados ? `<div class="mal"><strong>${t.recusados}</strong>recusados</div>` : ''}
    ${t.expirados ? `<div class="mal"><strong>${t.expirados}</strong>expirados</div>` : ''}
    ${t.nao_geradas ? `<div class="mal"><strong>${t.nao_geradas}</strong>linhas não geradas</div>` : ''}`
  const cols = l.colunas_resumo || []
  $('#linhas-lote').innerHTML = `
    <thead><tr><th>Linha</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Pessoa</th><th>Empresa</th><th>Situação</th></tr></thead>
    <tbody>${l.linhas.map(x => `
      <tr class="${x.situacao === 'nao_gerado' || x.situacao === 'recusado' ? 'linha-problema' : ''}">
        <td>${x.numero}</td>
        ${cols.map(c => `<td>${esc(x.resumo?.find(r => r.rotulo === c)?.valor || '')}</td>`).join('')}
        <td>${(x.pessoas || []).map(p => `${esc(PESSOA[p.status] || p.status)}${p.recusa_motivo ? `: "${esc(p.recusa_motivo)}"` : ''}`).join(', ')}</td>
        <td>${x.empresa ? (x.empresa === 'assinado' ? 'assinou' : 'pendente') : ''}</td>
        <td><span class="status ${esc(x.situacao)}">${esc(SIT[x.situacao] || x.situacao)}</span>
          ${x.codigo_verificacao ? `<br><a href="/v/${esc(x.codigo_verificacao)}" target="_blank" rel="noopener">selo</a>` : ''}
          ${x.problemas ? `<ul class="lista-curta">${x.problemas.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</td>
      </tr>`).join('')}</tbody>`
}

async function lembrar() {
  try {
    const r = await v1(`/lotes/${loteAtual.id}/lembrar`, { metodo: 'POST' })
    $('#lembrete').innerHTML = `<p class="aviso ok">${r.lembretes_enviados ? `Novo link enviado para ${plural(r.lembretes_enviados, 'pessoa', 'pessoas')}.` : 'Ninguém para lembrar.'}${r.empresa_lembrada ? ' A empresa também foi lembrada.' : ''} Os links anteriores deixaram de valer.</p>`
  } catch (e) { erro(e) }
}

// ── Eventos ─────────────────────────────────────────────────────────────────
$('#modelo').addEventListener('change', descreverModelo)
$('#form-planilha').addEventListener('submit', lerPlanilha)
$('#mapa').addEventListener('change', e => { const tr = e.target.closest('tr'); if (tr) atualizarAmostra(tr) })
$('#btn-conferir').addEventListener('click', conferir)
$('#btn-voltar-planilha').addEventListener('click', () => ir('planilha'))
$('#btn-voltar-colunas').addEventListener('click', () => ir('colunas'))
$('#form-enviar').addEventListener('submit', enviar)
$('#btn-lembrar').addEventListener('click', lembrar)
$('#btn-relatorio').addEventListener('click', async () => {
  try { await baixar(await fetch(`/v1/lotes/${loteAtual.id}/relatorio.csv`, { headers: { authorization: `Bearer ${chave}` } }), 'lote.csv') } catch (e) { erro(e) }
})
$('#btn-novo').addEventListener('click', () => { $('#form-planilha').reset(); descreverModelo(); listar(); ir('planilha') })
$('#lista').addEventListener('click', async e => {
  const a = e.target.closest('[data-lote]')
  if (!a) return
  e.preventDefault()
  try { loteAtual = await v1(`/lotes/${a.dataset.lote}`); acompanhar(loteAtual) } catch (er) { erro(er) }
})

iniciar().catch(erro)
