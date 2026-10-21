// Tela de assinatura: identificar (código) → ler com a bula → assinar.
// O servidor é quem decide se pode assinar; a tela só guia e explica.

import { $, ErroApi, api, aplicarMarca, baixar, dataHora, esc, guardar, mostrarErro, rosetaSvg } from './comum.js'

const token = decodeURIComponent(location.pathname.split('/assinar/')[1] || '')
const base = `/api/assinar/${encodeURIComponent(token)}`
const chaveSessao = `sessao:${token}`
let sessao = guardar.ler(chaveSessao)
let estado = null
const tempos = {}           // tempo visível por cláusula (ms), informado ao servidor como evidência auxiliar
let leituraEnviada = false

const comSessao = (caminho, opts = {}) => api(base + caminho, { ...opts, cabecalhos: { 'x-sessao': sessao || '' } })

// ── Navegação entre etapas ──────────────────────────────────────────────────
const TELAS = ['identificar', 'ler', 'assinar', 'fim']
function ir(tela) {
  for (const t of TELAS) $(`#tela-${t}`).hidden = t !== tela
  $('#barra').hidden = tela !== 'ler'
  $('#topo-acoes').hidden = tela !== 'ler' && tela !== 'assinar'
  const etapas = $('#etapas')
  etapas.hidden = tela === 'fim'
  const idx = TELAS.indexOf(tela)
  for (const li of etapas.children) {
    const i = TELAS.indexOf(li.dataset.etapa)
    if (i === idx) li.setAttribute('aria-current', 'step')
    else li.removeAttribute('aria-current')
    li.classList.toggle('feita', i < idx)
  }
  window.scrollTo({ top: 0 })
}

// ── Início ──────────────────────────────────────────────────────────────────
async function iniciar() {
  let info
  try {
    info = await api(base)
  } catch (e) {
    $('#emissor').textContent = 'Link de assinatura'
    return fim({ titulo: 'Este link não funciona', texto: e.message })
  }
  aplicarMarca(info.marca)
  $('#emissor').textContent = `Enviado por ${info.organizacao}`
  $('#titulo').textContent = info.titulo
  document.title = `Assinar: ${info.titulo}`

  if (sessao) {
    try { return await carregarConteudo() } catch (e) { if (!(e instanceof ErroApi && e.status === 401)) throw e }
    guardar.apagar(chaveSessao)
    sessao = null
  }

  const encerrado = { expirado: 'O prazo para assinar terminou', cancelado: 'Quem enviou cancelou este contrato', recusado: 'Este contrato foi recusado' }
  if (encerrado[info.contrato_status]) {
    return fim({ titulo: encerrado[info.contrato_status], texto: 'Não é mais possível assinar por este link. Se tiver dúvidas, fale com quem enviou o contrato.' })
  }

  const primeiroNome = info.signatario.nome.split(' ')[0]
  const jaAssinou = info.signatario.status === 'assinado'
  $('#saudacao').textContent = jaAssinou ? `${primeiroNome}, sua assinatura já está registrada` : `Olá, ${primeiroNome}`
  $('#explica-identificar').textContent = jaAssinou
    ? `Para ver ou baixar o contrato, confirme que é você com um código enviado para ${info.signatario.email}.`
    : `${info.organizacao} pediu a sua assinatura como ${info.signatario.papel.toLowerCase()}. Leva poucos minutos, em três passos:`
  $('#passos-assinatura').hidden = jaAssinou
  if (info.expira_em && !jaAssinou) {
    const dias = Math.ceil((new Date(info.expira_em) - Date.now()) / 864e5)
    $('#validade').textContent = dias > 1 ? `Este link vale por mais ${dias} dias (até ${dataHora(info.expira_em)}).` : dias === 1 ? `Este link vale até amanhã, ${dataHora(info.expira_em)}.` : `Este link vale até hoje, ${dataHora(info.expira_em)}.`
    $('#validade').hidden = false
  }
  ir('identificar')
}

// ── 1. Código ───────────────────────────────────────────────────────────────
let relogio
async function pedirCodigo() {
  const erro = $('#erro-codigo')
  erro.hidden = true
  try {
    const r = await api(`${base}/codigo`, { metodo: 'POST' })
    $('#pedir-codigo').hidden = true
    $('#form-codigo').hidden = false
    $('#codigo-destino').textContent = `Enviamos para ${r.enviado_para}. Ele vale 10 minutos.`
    $('#codigo').focus()
    contarReenvio(r.reenviar_em_s)
  } catch (e) {
    if (!$('#form-codigo').hidden) mostrarErro(erro, e)
    else mostrarErro($('#erro-geral'), e)
    if (e.detalhes?.aguardar_s) contarReenvio(e.detalhes.aguardar_s)
  }
}

function contarReenvio(seg) {
  const btn = $('#btn-reenviar')
  clearInterval(relogio)
  let r = seg
  const pinta = () => {
    btn.disabled = r > 0
    btn.textContent = r > 0 ? `Enviar outro código em ${r}s` : 'Enviar outro código'
  }
  pinta()
  relogio = setInterval(() => { r--; pinta(); if (r <= 0) clearInterval(relogio) }, 1000)
}

async function validarCodigo(ev) {
  ev.preventDefault()
  const erro = $('#erro-codigo')
  erro.hidden = true
  try {
    const r = await api(`${base}/codigo/validar`, { metodo: 'POST', corpo: { codigo: $('#codigo').value.trim() } })
    sessao = r.sessao
    guardar.gravar(chaveSessao, sessao)
    await carregarConteudo()
  } catch (e) {
    mostrarErro(erro, e)
    $('#codigo').select()
  }
}

// ── 2. Leitura ──────────────────────────────────────────────────────────────
async function carregarConteudo() {
  estado = await comSessao('/conteudo')
  const s = estado.signatario
  if (s.status === 'assinado' || s.status === 'recusado' || !['enviado', 'parcialmente_assinado'].includes(estado.contrato_status)) {
    return telaFim()
  }
  leituraEnviada = !!s.leitura_completa_em
  desenharDocumento()
  atualizarProgresso()
  ir('ler')
  observarLeitura()
  vigiarRespostas()
}

function desenharDocumento() {
  const doc = $('#documento')
  const partes = []
  if (estado.preambulo) partes.push(`<p class="preambulo">${esc(estado.preambulo)}</p>`)
  for (const c of estado.clausulas) {
    partes.push(`
      <section class="clausula${c.critica ? ' critica' : ''}" data-chave="${esc(c.chave)}" aria-labelledby="cl-${esc(c.chave)}">
        <p class="cl-num" aria-hidden="true">Cláusula ${c.numero}${c.critica ? ' <span class="destaque">Em destaque</span>' : ''}</p>
        <h3 id="cl-${esc(c.chave)}"><span class="sr">Cláusula ${c.numero}: </span>${esc(c.titulo)}${c.critica ? '<span class="sr"> (em destaque)</span>' : ''}</h3>
        ${c.resumo ? `<p class="bula"><span class="rotulo">Em palavras simples</span><mark>${esc(c.resumo)}</mark></p>` : ''}
        <div class="texto-juridico">${c.resumo ? '<p class="rotulo">Texto do contrato</p>' : ''}${c.paragrafos.map(p => `<p><span class="pnum">${esc(p.numero)}</span>${esc(p.texto)}</p>`).join('')}<div class="duvida" data-duvida="${esc(c.chave)}">${blocoDuvida(c)}</div></div>
        ${c.critica ? `<div class="ciencia">${botaoCiencia(c)}</div>` : ''}
      </section>`)
  }
  if (estado.fecho) partes.push(`<p class="fecho">${esc(estado.fecho)}</p>`)
  doc.innerHTML = partes.join('')
}

function botaoCiencia(c) {
  if (c.ciente_em) return `<span class="ciente">Você confirmou que entendeu, ${esc(dataHora(c.ciente_em))}</span>`
  return `<button class="botao secundario" data-ciencia="${esc(c.chave)}">Li e entendi esta cláusula</button>`
}

// ── Dúvida sobre a cláusula ─────────────────────────────────────────────────
// Vai para quem enviou o contrato, que responde por e-mail e aqui mesmo.
// Perguntar não trava nada: a pessoa decide se espera a resposta.
const duvidaAberta = new Set()
function blocoDuvida(c) {
  const lista = (c.duvidas || []).map(d => `
    <div class="duvida-item">
      <p class="pergunta"><span class="rotulo">Sua dúvida, ${esc(dataHora(d.em))}</span>${esc(d.pergunta)}</p>
      ${d.resposta
        ? `<p class="resposta"><span class="rotulo">Resposta${d.respondida_por ? ` de ${esc(d.respondida_por)}` : ''}, ${esc(dataHora(d.respondida_em))}</span>${esc(d.resposta)}</p>`
        : '<p class="aguardando">Enviada. Quem mandou o contrato vai responder por e-mail e aqui mesmo.</p>'}
    </div>`).join('')
  if (duvidaAberta.has(c.chave)) {
    return `${lista}<form class="form-duvida">
      <label class="campo"><span>O que ficou em dúvida nesta cláusula?</span><textarea required minlength="3" maxlength="1000" rows="3" placeholder="Ex.: a multa vale se eu precisar sair por doença?"></textarea></label>
      <div class="acoes-duvida"><button class="botao secundario pequeno" type="submit">Enviar pergunta</button><button type="button" class="link-botao" data-cancelar-duvida>Cancelar</button></div>
      <small>A resposta explica; o que vale é o texto do contrato.</small>
    </form>`
  }
  const pode = ['enviado', 'parcialmente_assinado'].includes(estado.contrato_status) && !['assinado', 'recusado'].includes(estado.signatario.status)
  return `${lista}${pode ? `<button type="button" class="link-botao duvida-abrir" data-abrir-duvida>${lista ? 'Outra dúvida' : 'Tenho uma dúvida sobre esta cláusula'}</button>` : ''}`
}
function redesenharDuvida(chave) {
  const c = estado.clausulas.find(x => x.chave === chave)
  const caixa = document.querySelector(`.duvida[data-duvida="${CSS.escape(chave)}"]`)
  if (c && caixa) caixa.innerHTML = blocoDuvida(c)
}
async function enviarDuvida(form) {
  const chave = form.closest('.duvida').dataset.duvida
  const btn = form.querySelector('button[type=submit]')
  btn.disabled = true
  try {
    const d = await comSessao('/duvida', { metodo: 'POST', corpo: { clausula: chave, pergunta: form.querySelector('textarea').value } })
    const c = estado.clausulas.find(x => x.chave === chave)
    c.duvidas = [...(c.duvidas || []), d]
    duvidaAberta.delete(chave)
    redesenharDuvida(chave)
    vigiarRespostas()
  } catch (e) {
    btn.disabled = false
    tratarErro(e)
  }
}
// Enquanto houver pergunta sem resposta, confere a cada 30 s se a resposta chegou.
let vigia = null
function vigiarRespostas() {
  const pendente = estado?.clausulas.some(c => (c.duvidas || []).some(d => !d.resposta))
  if (!pendente) { clearInterval(vigia); vigia = null; return }
  if (vigia) return
  vigia = setInterval(async () => {
    try {
      const novo = await comSessao('/conteudo')
      for (const c of novo.clausulas) {
        const atual = estado.clausulas.find(x => x.chave === c.chave)
        if (!atual) continue
        const antes = JSON.stringify(atual.duvidas || [])
        atual.duvidas = c.duvidas || []
        if (JSON.stringify(atual.duvidas) !== antes) redesenharDuvida(c.chave)
      }
      vigiarRespostas()
    } catch { /* tenta de novo no próximo ciclo */ }
  }, 30_000)
}

async function darCiencia(btn) {
  const chave = btn.dataset.ciencia
  btn.disabled = true
  try {
    const r = await comSessao('/ciencia', { metodo: 'POST', corpo: { clausula: chave, tempo_leitura_ms: Math.round(tempos[chave] || 0) } })
    const c = estado.clausulas.find(x => x.chave === chave)
    c.ciente_em = r.ciente_em
    const caixa = btn.parentElement
    caixa.innerHTML = botaoCiencia(c)
    caixa.firstElementChild.classList.add('ciente-anima')
    atualizarProgresso()
  } catch (e) {
    btn.disabled = false
    tratarErro(e)
  }
}

function atualizarProgresso() {
  const criticas = estado.clausulas.filter(c => c.critica)
  const feitas = criticas.filter(c => c.ciente_em).length
  const pronto = feitas === criticas.length && leituraEnviada
  const suaVez = estado.signatario.sua_vez
  let texto
  if (!suaVez) texto = 'Outra pessoa assina antes de você. Avisaremos por e-mail.'
  else if (feitas < criticas.length) texto = `<strong>${feitas} de ${criticas.length}</strong> destaques confirmados`
  else if (!leituraEnviada) texto = 'Role até o fim do contrato'
  else texto = '<strong>Tudo lido.</strong> Pode assinar.'
  $('#progresso').innerHTML = texto
  const trilho = $('#trilho')
  // Cada segmento é uma cláusula em destaque: tocar leva até ela.
  trilho.innerHTML = criticas.map(c => `<i data-ir="${esc(c.chave)}" title="Cláusula ${c.numero}"${c.ciente_em ? ' class="feito"' : ''}></i>`).join('') || '<i class="feito"></i>'
  trilho.classList.toggle('completo', pronto)
  // O botão leva ao próximo destaque pendente; quando tudo está lido, à assinatura.
  const btn = $('#btn-ir-assinar')
  const proximo = criticas.find(c => !c.ciente_em)
  if (pronto) { btn.textContent = 'Ir para assinatura'; btn.disabled = !suaVez; btn.dataset.acao = 'assinar' }
  else if (proximo) { btn.textContent = 'Próximo destaque'; btn.disabled = false; btn.dataset.acao = proximo.chave }
  else { btn.textContent = 'Ir até o fim'; btn.disabled = false; btn.dataset.acao = 'fim' }
}

let observador
function observarLeitura() {
  observador?.disconnect()
  const visiveis = new Map()
  observador = new IntersectionObserver(entradas => {
    const agora = performance.now()
    for (const e of entradas) {
      if (e.target.id === 'fim-leitura') {
        if (e.isIntersecting && !leituraEnviada) enviarLeitura()
        continue
      }
      const chave = e.target.dataset.chave
      if (e.isIntersecting) visiveis.set(chave, agora)
      else if (visiveis.has(chave)) { tempos[chave] = (tempos[chave] || 0) + agora - visiveis.get(chave); visiveis.delete(chave) }
    }
  }, { threshold: 0.35 })
  document.querySelectorAll('.clausula').forEach(el => observador.observe(el))
  observador.observe($('#fim-leitura'))
  // Contabiliza o que ainda está na tela quando a pessoa clica em "Li e entendi".
  document.addEventListener('pointerdown', () => {
    const agora = performance.now()
    for (const [k, t] of visiveis) { tempos[k] = (tempos[k] || 0) + agora - t; visiveis.set(k, agora) }
  }, { capture: true })
}

async function enviarLeitura() {
  leituraEnviada = true
  try {
    await comSessao('/leitura', { metodo: 'POST', corpo: { tempos } })
  } catch (e) {
    leituraEnviada = false
    return tratarErro(e)
  }
  atualizarProgresso()
}

// ── 3. Assinar ──────────────────────────────────────────────────────────────
function telaAssinar() {
  const criticas = estado.clausulas.filter(c => c.critica).length
  const semResposta = estado.clausulas.reduce((n, c) => n + (c.duvidas || []).filter(d => !d.resposta).length, 0)
  const linhas = [
    ['Contrato', estado.titulo],
    ['Enviado por', estado.organizacao],
    ['Cláusulas em destaque', `${criticas} confirmadas por você`],
    ...(semResposta ? [['Dúvidas', `${semResposta} sem resposta. Você pode assinar mesmo assim, ou esperar.`]] : []),
    ...estado.outros.map(o => [o.papel, `${o.nome}: ${rotuloStatus(o.status)}`]),
  ]
  $('#resumo-assinatura').innerHTML = linhas.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join('')
  const icp = estado.signatario.metodo === 'icp'
  $('#form-assinar').hidden = icp
  $('#form-icp').hidden = !icp
  ir('assinar')
  if (icp) {
    $('#icp-nome').textContent = estado.signatario.nome
    return
  }
  $('#nome-dica').textContent = `Do jeito que está no contrato: ${estado.signatario.nome}`
  $('#nome').focus()
}

// ── Assinatura com certificado ICP-Brasil ───────────────────────────────────
let arquivoIcp = null
function escolherIcp(arquivo) {
  if (!arquivo) return
  arquivoIcp = arquivo
  $('#soltar-icp-texto').textContent = arquivo.name
  $('#btn-enviar-icp').disabled = false
  $('#erro-icp').hidden = true
}

async function enviarIcp() {
  const b = $('#btn-enviar-icp')
  b.disabled = true
  b.textContent = 'Conferindo a assinatura…'
  $('#erro-icp').hidden = true
  try {
    const r = await fetch(`${base}/icp`, { method: 'POST', headers: { 'x-sessao': sessao || '', 'content-type': 'application/pdf' }, body: arquivoIcp })
    const corpo = await r.json()
    if (!r.ok) throw new ErroApi(r.status, corpo)
    estado = await comSessao('/conteudo')
    telaFim()
  } catch (e) {
    mostrarErro($('#erro-icp'), e)
    if (e.status === 401) tratarErro(e)
  } finally {
    b.disabled = !arquivoIcp
    b.textContent = 'Enviar e assinar'
  }
}

function rotuloStatus(s) {
  return { assinado: 'já assinou', recusado: 'recusou', identificado: 'está lendo', notificado: 'ainda não abriu', aguardando: 'assina depois' }[s] || s
}

function localizacao() {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), precisao_m: Math.round(p.coords.accuracy) }),
      () => ok(null),
      { timeout: 8000, maximumAge: 60000 },
    )
  })
}

async function assinar(ev) {
  ev.preventDefault()
  const erro = $('#erro-assinar')
  erro.hidden = true
  const btn = $('#btn-assinar')
  btn.disabled = true
  btn.textContent = 'Assinando…'
  try {
    const geo = $('#geo').checked ? await localizacao() : null
    await comSessao('/assinar', { metodo: 'POST', corpo: { nome_digitado: $('#nome').value, concordo: $('#concordo').checked, geo } })
    estado = await comSessao('/conteudo')
    telaFim()
  } catch (e) {
    mostrarErro(erro, e)
    if (e.status === 401) tratarErro(e)
  } finally {
    btn.disabled = false
    btn.textContent = 'Assinar contrato'
  }
}

async function recusar(ev) {
  ev.preventDefault()
  const erro = $('#erro-recusar')
  erro.hidden = true
  try {
    await comSessao('/recusar', { metodo: 'POST', corpo: { motivo: $('#motivo').value } })
    estado = await comSessao('/conteudo')
    telaFim()
  } catch (e) {
    mostrarErro(erro, e)
  }
}

// ── Fim ─────────────────────────────────────────────────────────────────────
function telaFim() {
  const s = estado.signatario
  if (s.status === 'recusado') return fim({ titulo: 'Você recusou este contrato', texto: 'Quem enviou foi avisado, com o motivo que você escreveu. Nada foi assinado.' })
  if (estado.contrato_status === 'assinado') {
    return fim({
      titulo: 'Contrato assinado por todos',
      texto: 'A sua via tem um QR e um código em cada página. Qualquer pessoa pode conferir por eles que o documento é autêntico e não foi alterado.',
      extra: `<div class="fim-selo"><div class="carimbo" aria-hidden="true">${rosetaSvg()}<b>✓</b></div><div><span>Código de verificação</span><p class="codigo-grande">${esc(estado.codigo_verificacao)}</p></div></div>
        <div class="fim-acoes"><button class="botao largo" data-baixar="final">Baixar a via assinada</button>
        <a href="/v/${encodeURIComponent(estado.codigo_verificacao)}">Ver o selo de autenticidade</a></div>`,
    })
  }
  if (s.status === 'assinado') {
    const faltam = estado.outros.filter(o => o.status !== 'assinado').length
    return fim({
      titulo: 'Sua assinatura foi registrada',
      texto: `Falta${faltam > 1 ? 'm' : ''} ${faltam} assinatura${faltam > 1 ? 's' : ''}. Quando todos assinarem, você recebe um e-mail com o código de verificação e pode baixar a via assinada por este mesmo link.`,
      extra: '<div class="fim-acoes"><button class="botao secundario largo" data-baixar="original">Baixar o texto que você assinou</button></div>',
    })
  }
  const msgs = { expirado: 'O prazo para assinar terminou', cancelado: 'Quem enviou cancelou este contrato', recusado: 'Outra pessoa recusou este contrato' }
  return fim({ titulo: msgs[estado.contrato_status] || 'Contrato indisponível', texto: 'Não é mais possível assinar por este link.' })
}

function fim({ titulo, texto, extra = '' }) {
  $('#fim').innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${extra}`
  $('#topo-acoes').hidden = true
  ir('fim')
}

function tratarErro(e) {
  if (e instanceof ErroApi && e.status === 401) {
    guardar.apagar(chaveSessao)
    sessao = null
    mostrarErro($('#erro-geral'), new Error('Sua sessão expirou. Confirme o código de novo para continuar de onde parou.'))
    $('#pedir-codigo').hidden = false
    $('#form-codigo').hidden = true
    return ir('identificar')
  }
  mostrarErro($('#erro-geral'), e)
  window.scrollTo({ top: 0 })
}

// ── Eventos ─────────────────────────────────────────────────────────────────
$('#btn-pedir').addEventListener('click', pedirCodigo)
$('#btn-reenviar').addEventListener('click', pedirCodigo)
$('#form-codigo').addEventListener('submit', validarCodigo)
$('#codigo').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
  if (e.target.value.length === 6) $('#form-codigo').requestSubmit()
})
$('#documento').addEventListener('click', e => {
  const b = e.target.closest('[data-ciencia]')
  if (b) return darCiencia(b)
  const abrir = e.target.closest('[data-abrir-duvida]')
  if (abrir) {
    const k = abrir.closest('.duvida').dataset.duvida
    duvidaAberta.add(k)
    redesenharDuvida(k)
    return document.querySelector(`.duvida[data-duvida="${CSS.escape(k)}"] textarea`)?.focus()
  }
  const cancelar = e.target.closest('[data-cancelar-duvida]')
  if (cancelar) { const k = cancelar.closest('.duvida').dataset.duvida; duvidaAberta.delete(k); redesenharDuvida(k) }
})
$('#documento').addEventListener('submit', e => { const f = e.target.closest('.form-duvida'); if (f) { e.preventDefault(); enviarDuvida(f) } })
const irAte = (chave) => document.querySelector(`.clausula[data-chave="${CSS.escape(chave)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
$('#btn-ir-assinar').addEventListener('click', () => {
  const acao = $('#btn-ir-assinar').dataset.acao
  if (acao === 'assinar') return telaAssinar()
  if (acao === 'fim') return $('#fim-leitura').scrollIntoView({ behavior: 'smooth', block: 'end' })
  irAte(acao)
})
$('#trilho').addEventListener('click', e => { const i = e.target.closest('[data-ir]'); if (i) irAte(i.dataset.ir) })
$('#btn-baixar-ler').addEventListener('click', async () => {
  try { await baixar(await comSessao('/arquivo?qual=original'), 'contrato.pdf') } catch (er) { tratarErro(er) }
})
$('#btn-voltar-ler').addEventListener('click', () => { ir('ler') })
$('#form-assinar').addEventListener('submit', assinar)
$('#btn-abrir-recusa').addEventListener('click', () => { $('#form-recusar').hidden = false; $('#motivo').focus() })
$('#form-recusar').addEventListener('submit', recusar)
$('#btn-baixar-icp').addEventListener('click', async () => {
  try { await baixar(await comSessao('/arquivo?qual=original'), 'contrato-para-assinar.pdf') } catch (er) { tratarErro(er) }
})
$('#arquivo-icp').addEventListener('change', e => escolherIcp(e.target.files[0]))
const zonaIcp = $('#soltar-icp')
zonaIcp.addEventListener('dragover', e => { e.preventDefault(); zonaIcp.classList.add('sobre') })
zonaIcp.addEventListener('dragleave', () => zonaIcp.classList.remove('sobre'))
zonaIcp.addEventListener('drop', e => { e.preventDefault(); zonaIcp.classList.remove('sobre'); escolherIcp(e.dataTransfer.files[0]) })
$('#btn-enviar-icp').addEventListener('click', enviarIcp)
$('#fim').addEventListener('click', async e => {
  const b = e.target.closest('[data-baixar]')
  if (!b) return
  try { await baixar(await comSessao(`/arquivo?qual=${b.dataset.baixar}`), 'contrato.pdf') } catch (er) { tratarErro(er) }
})

iniciar().catch(tratarErro)
