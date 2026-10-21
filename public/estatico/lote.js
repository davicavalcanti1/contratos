// Representante da empresa assinando um lote: lê o modelo (com as variações
// indicadas) e a tabela com os dados de cada contrato, e assina todos.

import { $, ErroApi, api, dataHora, esc, guardar, mostrarErro } from './comum.js'

const token = decodeURIComponent(location.pathname.split('/lote/')[1] || '')
const base = `/api/lote/${encodeURIComponent(token)}`
const chaveSessao = `sessao-lote:${token}`
let sessao = guardar.ler(chaveSessao)
let estado = null
let leituraEnviada = false
const tempos = {}

const comSessao = (c, o = {}) => api(base + c, { ...o, cabecalhos: { 'x-sessao': sessao || '' } })

const TELAS = ['identificar', 'ler', 'assinar', 'fim']
function ir(tela) {
  for (const t of TELAS) $(`#tela-${t}`).hidden = t !== tela
  $('#barra').hidden = tela !== 'ler'
  $('#topo-acoes').hidden = tela !== 'ler'
  $('#etapas').hidden = tela === 'fim'
  const idx = TELAS.indexOf(tela)
  for (const li of $('#etapas').children) {
    const i = TELAS.indexOf(li.dataset.etapa)
    if (i === idx) li.setAttribute('aria-current', 'step')
    else li.removeAttribute('aria-current')
    li.classList.toggle('feita', i < idx)
  }
  window.scrollTo({ top: 0 })
}

// «rótulo» vira um campo visível: é o que muda de contrato para contrato.
const comCampos = (t) => esc(t).replace(/«([^»]+)»/g, '<span class="var">$1</span>')
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`
const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())

async function iniciar() {
  let info
  try { info = await api(base) } catch (e) {
    $('#emissor').textContent = 'Assinatura em lote'
    return fim('Este link não funciona', e.message)
  }
  aplicarMarca(info.marca)
  $('#emissor').textContent = `${info.organizacao} · ${info.lote}`
  $('#titulo').textContent = info.modelo
  document.title = `Assinar em lote: ${info.lote}`
  if (sessao) {
    try { return await carregar() } catch (e) { if (!(e instanceof ErroApi && e.status === 401)) throw e }
    guardar.apagar(chaveSessao); sessao = null
  }
  $('#saudacao').textContent = `Olá, ${info.assinante.nome.split(' ')[0]}`
  $('#explica').textContent = info.pendentes
    ? `${plural(info.pendentes, 'contrato aguarda', 'contratos aguardam')} a assinatura da empresa. Você assina todos de uma vez, em poucos minutos:`
    : `Não há contrato pendente da assinatura da empresa neste lote. Confirme o código enviado para ${info.assinante.email} para ver a situação de cada um.`
  $('#passos-assinatura').hidden = !info.pendentes
  ir('identificar')
}

let relogio
async function pedirCodigo() {
  $('#erro-codigo').hidden = true
  try {
    const r = await api(`${base}/codigo`, { metodo: 'POST' })
    $('#pedir-codigo').hidden = true
    $('#form-codigo').hidden = false
    $('#codigo-destino').textContent = `Enviamos para ${r.enviado_para}. Ele vale 10 minutos.`
    $('#codigo').focus()
    contar(r.reenviar_em_s)
  } catch (e) {
    mostrarErro($('#form-codigo').hidden ? $('#erro-geral') : $('#erro-codigo'), e)
    if (e.detalhes?.aguardar_s) contar(e.detalhes.aguardar_s)
  }
}
function contar(seg) {
  const b = $('#btn-reenviar')
  clearInterval(relogio)
  let r = seg
  const pinta = () => { b.disabled = r > 0; b.textContent = r > 0 ? `Enviar outro código em ${r}s` : 'Enviar outro código' }
  pinta()
  relogio = setInterval(() => { r--; pinta(); if (r <= 0) clearInterval(relogio) }, 1000)
}
async function validar(ev) {
  ev.preventDefault()
  $('#erro-codigo').hidden = true
  try {
    const r = await api(`${base}/codigo/validar`, { metodo: 'POST', corpo: { codigo: $('#codigo').value.trim() } })
    sessao = r.sessao
    guardar.gravar(chaveSessao, sessao)
    await carregar()
  } catch (e) { mostrarErro($('#erro-codigo'), e); $('#codigo').select() }
}

async function carregar() {
  estado = await comSessao('/conteudo')
  if (!estado.pendentes) return telaFim()
  leituraEnviada = !!estado.assinante.leitura_completa_em
  const total = estado.contratos.length
  $('#explica-modelo').textContent = `Você está assinando ${plural(estado.pendentes, 'contrato', 'contratos')} do mesmo modelo. O texto abaixo é o modelo; os dados de cada pessoa estão na tabela no fim. Cláusulas que não entram em todos os ${total} contratos estão indicadas.`
  desenharModelo()
  desenharTabela()
  progresso()
  ir('ler')
  observar()
}

function desenharModelo() {
  const total = estado.contratos.length
  const partes = []
  if (estado.preambulo) partes.push(`<p class="preambulo">${comCampos(estado.preambulo)}</p>`)
  for (const c of estado.clausulas) {
    const parcial = c.contratos != null && c.contratos < total
    const cond = [c.condicao && `Só quando ${c.condicao}`, parcial && `entra em ${c.contratos} de ${total} contratos`].filter(Boolean).join(', ')
    partes.push(`
      <section class="clausula${c.critica ? ' critica' : ''}" data-chave="${esc(c.chave)}">
        ${c.critica || cond ? `<p class="cl-num">${c.critica ? '<span class="destaque">Em destaque</span>' : ''}${cond ? `<span class="condicao">${esc(cond)}</span>` : ''}</p>` : ''}
        <h3>${esc(c.titulo)}</h3>
        ${c.resumo ? `<p class="bula"><span class="rotulo">Em palavras simples</span><mark>${comCampos(c.resumo)}</mark></p>` : ''}
        <div class="texto-juridico">${c.resumo ? '<p class="rotulo">Texto do modelo</p>' : ''}${c.paragrafos.map(p => `<p>${p.condicao ? `<span class="condicao">Só quando ${esc(p.condicao)}:</span> ` : ''}${comCampos(p.texto)}</p>`).join('')}</div>
        ${c.critica ? `<div class="ciencia">${botao(c)}</div>` : ''}
      </section>`)
  }
  if (estado.fecho) partes.push(`<p class="fecho">${comCampos(estado.fecho)}</p>`)
  $('#documento').innerHTML = partes.join('')
}

function botao(c) {
  if (c.ciente_em) return `<span class="ciente">Você confirmou que entendeu, ${esc(dataHora(c.ciente_em))}</span>`
  return `<button class="botao secundario" data-ciencia="${esc(c.chave)}">Li e entendi esta cláusula</button>`
}

const SIT = { assinado: 'assinou', identificado: 'está lendo', notificado: 'ainda não abriu', recusado: 'recusou', aguardando: 'aguardando' }
const PILULA = { assinado: 'assinado', recusado: 'recusado' }
function desenharTabela() {
  const pend = estado.contratos.filter(c => ['enviado', 'parcialmente_assinado'].includes(c.contrato_status) && c.assinatura_empresa !== 'assinado')
  $('#titulo-tabela').textContent = `Os ${plural(estado.contratos.length, 'contrato', 'contratos')} deste lote`
  $('#nota-tabela').textContent = pend.length === estado.contratos.length ? 'Você vai assinar todos agora.' : `Você vai assinar ${plural(pend.length, 'deles agora', 'deles agora')}; os outros já estão assinados pela empresa ou não estão mais em assinatura.`
  const cols = estado.colunas || []
  const situacaoEmpresa = (c) => c.assinatura_empresa === 'assinado' ? '<span class="status assinado">Já assinada</span>' : pend.includes(c) ? '<span class="status enviado">Vai assinar agora</span>' : `<span class="status ${esc(PILULA[c.contrato_status] || 'encerrado')}">${esc(cap(c.contrato_status))}</span>`
  $('#tabela').innerHTML = `
    <thead><tr><th>Linha</th>${cols.map(c => `<th>${esc(cap(c))}</th>`).join('')}<th>A pessoa</th><th>Empresa</th></tr></thead>
    <tbody>${estado.contratos.map(c => `
      <tr${pend.includes(c) ? '' : ' class="fora"'}>
        <td><small>${c.linha}</small></td>
        ${cols.map(col => `<td>${esc(c.resumo.find(r => r.rotulo === col)?.valor || '')}</td>`).join('')}
        <td>${c.outros.map(o => esc(cap(SIT[o.status] || o.status))).join(', ')}</td>
        <td>${situacaoEmpresa(c)}</td>
      </tr>`).join('')}
    </tbody>`
  // No celular, a mesma tabela em cartões.
  $('#lista-lote').innerHTML = estado.contratos.map(c => `
    <li${pend.includes(c) ? '' : ' class="fora"'}>
      <div class="lote-m-topo"><strong>${esc(c.resumo[0]?.valor || `Linha ${c.linha}`)}</strong>${situacaoEmpresa(c)}</div>
      <span>linha ${c.linha}${c.resumo.slice(1).map(r => ` · ${esc(r.valor)}`).join('')}</span>
      <span>a pessoa: ${c.outros.map(o => esc(SIT[o.status] || o.status)).join(', ')}</span>
    </li>`).join('')
}

async function ciencia(b) {
  b.disabled = true
  try {
    const r = await comSessao('/ciencia', { metodo: 'POST', corpo: { clausula: b.dataset.ciencia, tempo_leitura_ms: Math.round(tempos[b.dataset.ciencia] || 0) } })
    const c = estado.clausulas.find(x => x.chave === b.dataset.ciencia)
    c.ciente_em = r.ciente_em
    const caixa = b.parentElement
    caixa.innerHTML = botao(c)
    caixa.firstElementChild.classList.add('ciente-anima')
    progresso()
  } catch (e) { b.disabled = false; tratar(e) }
}

function progresso() {
  const crit = estado.clausulas.filter(c => c.critica)
  const feitas = crit.filter(c => c.ciente_em).length
  const pronto = feitas === crit.length && leituraEnviada
  let t
  if (feitas < crit.length) t = `<strong>${feitas} de ${crit.length}</strong> destaques confirmados`
  else if (!leituraEnviada) t = 'Role até o fim da tabela de contratos'
  else t = `<strong>Tudo lido.</strong> Pode assinar ${plural(estado.pendentes, 'contrato', 'contratos')}.`
  $('#progresso').innerHTML = t
  const trilho = $('#trilho')
  trilho.innerHTML = crit.map(c => `<i data-ir="${esc(c.chave)}" title="${esc(c.titulo)}"${c.ciente_em ? ' class="feito"' : ''}></i>`).join('') || '<i class="feito"></i>'
  trilho.classList.toggle('completo', pronto)
  const btn = $('#btn-ir-assinar')
  const proximo = crit.find(c => !c.ciente_em)
  if (pronto) { btn.textContent = `Assinar ${plural(estado.pendentes, 'contrato', 'contratos')}`; btn.disabled = false; btn.dataset.acao = 'assinar' }
  else if (proximo) { btn.textContent = 'Próximo destaque'; btn.disabled = false; btn.dataset.acao = proximo.chave }
  else { btn.textContent = 'Ir até a tabela'; btn.disabled = false; btn.dataset.acao = 'fim' }
}

let obs
function observar() {
  obs?.disconnect()
  const vis = new Map()
  obs = new IntersectionObserver(es => {
    const agora = performance.now()
    for (const e of es) {
      if (e.target.id === 'fim-leitura') { if (e.isIntersecting && !leituraEnviada) leitura(); continue }
      const k = e.target.dataset.chave
      if (e.isIntersecting) vis.set(k, agora)
      else if (vis.has(k)) { tempos[k] = (tempos[k] || 0) + agora - vis.get(k); vis.delete(k) }
    }
  }, { threshold: 0.35 })
  document.querySelectorAll('.clausula').forEach(el => obs.observe(el))
  obs.observe($('#fim-leitura'))
  document.addEventListener('pointerdown', () => {
    const agora = performance.now()
    for (const [k, t] of vis) { tempos[k] = (tempos[k] || 0) + agora - t; vis.set(k, agora) }
  }, { capture: true })
}

async function leitura() {
  leituraEnviada = true
  try { await comSessao('/leitura', { metodo: 'POST', corpo: { tempos } }) } catch (e) { leituraEnviada = false; return tratar(e) }
  progresso()
}

function telaAssinar() {
  const n = estado.pendentes
  $('#titulo-assinar').textContent = `Assinar ${plural(n, 'contrato', 'contratos')}`
  $('#resumo-assinatura').innerHTML = [
    ['Lote', estado.lote],
    ['Modelo', estado.titulo],
    ['Contratos que você vai assinar', String(n)],
    ['Cláusulas em destaque', `${estado.clausulas.filter(c => c.critica).length} confirmadas por você`],
  ].map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('')
  $('#nome-dica').textContent = `Do jeito que foi cadastrado: ${estado.assinante.nome}`
  $('#texto-concordo').textContent = `Li o modelo, conferi os dados de cada contrato na tabela e concordo com os ${plural(n, 'contrato', 'contratos')}, em nome de ${estado.organizacao}.`
  $('#btn-assinar').textContent = `Assinar ${plural(n, 'contrato', 'contratos')}`
  ir('assinar')
  $('#nome').focus()
}

function local() {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), precisao_m: Math.round(p.coords.accuracy) }),
      () => ok(null), { timeout: 8000, maximumAge: 60000 })
  })
}

async function assinar(ev) {
  ev.preventDefault()
  $('#erro-assinar').hidden = true
  const b = $('#btn-assinar'), texto = b.textContent
  b.disabled = true
  b.textContent = 'Assinando…'
  try {
    const geo = $('#geo').checked ? await local() : null
    const r = await comSessao('/assinar', { metodo: 'POST', corpo: { nome_digitado: $('#nome').value, concordo: $('#concordo').checked, geo } })
    estado = await comSessao('/conteudo')
    telaFim(r.assinados)
  } catch (e) {
    mostrarErro($('#erro-assinar'), e)
    if (e.status === 401) tratar(e)
  } finally { b.disabled = false; b.textContent = texto }
}

function telaFim(acabouDeAssinar) {
  const emAssinatura = estado.contratos.filter(c => ['enviado', 'parcialmente_assinado'].includes(c.contrato_status))
  const faltamPessoas = emAssinatura.filter(c => c.outros.some(o => o.status !== 'assinado')).length
  const concluidos = estado.contratos.filter(c => c.contrato_status === 'assinado').length
  const titulo = acabouDeAssinar ? `${plural(acabouDeAssinar, 'contrato assinado', 'contratos assinados')} pela empresa` : 'Nada pendente da empresa neste lote'
  const texto = faltamPessoas
    ? `${plural(faltamPessoas, 'pessoa ainda não assinou', 'pessoas ainda não assinaram')} o próprio contrato. Cada um é selado quando a pessoa assina, e quem enviou o lote acompanha o andamento.`
    : 'Todos os contratos deste lote estão concluídos.'
  fim(titulo, texto, `<ul class="fim-lote"><li><b>${concluidos}</b> ${concluidos === 1 ? 'contrato concluído' : 'contratos concluídos'} por todos</li><li><b>${faltamPessoas}</b> ${faltamPessoas === 1 ? 'aguarda a pessoa' : 'aguardam a pessoa'}</li></ul>`)
}

function fim(t, x, extra = '') {
  $('#fim').innerHTML = `<h2>${esc(t)}</h2><p>${esc(x)}</p>${extra}`
  $('#topo-acoes').hidden = true
  ir('fim')
}

function tratar(e) {
  if (e instanceof ErroApi && e.status === 401) {
    guardar.apagar(chaveSessao); sessao = null
    mostrarErro($('#erro-geral'), new Error('Sua sessão expirou. Confirme o código de novo para continuar de onde parou.'))
    $('#pedir-codigo').hidden = false; $('#form-codigo').hidden = true
    return ir('identificar')
  }
  mostrarErro($('#erro-geral'), e)
  window.scrollTo({ top: 0 })
}

const irAte = (chave) => document.querySelector(`.clausula[data-chave="${CSS.escape(chave)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
$('#btn-pedir').addEventListener('click', pedirCodigo)
$('#btn-reenviar').addEventListener('click', pedirCodigo)
$('#form-codigo').addEventListener('submit', validar)
$('#codigo').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
  if (e.target.value.length === 6) $('#form-codigo').requestSubmit()
})
$('#documento').addEventListener('click', e => { const b = e.target.closest('[data-ciencia]'); if (b) ciencia(b) })
$('#btn-ir-assinar').addEventListener('click', () => {
  const acao = $('#btn-ir-assinar').dataset.acao
  if (acao === 'assinar') return telaAssinar()
  if (acao === 'fim') return $('#secao-tabela').scrollIntoView({ behavior: 'smooth', block: 'start' })
  irAte(acao)
})
$('#trilho').addEventListener('click', e => { const i = e.target.closest('[data-ir]'); if (i) irAte(i.dataset.ir) })
$('#btn-ir-tabela').addEventListener('click', () => $('#secao-tabela').scrollIntoView({ behavior: 'smooth', block: 'start' }))
$('#btn-voltar-ler').addEventListener('click', () => ir('ler'))
$('#form-assinar').addEventListener('submit', assinar)

iniciar().catch(tratar)
