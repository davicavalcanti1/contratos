// Site de apresentação. Três coisas funcionam de verdade aqui:
//   1. a demonstração da assinatura, só no navegador (nada é gravado);
//   2. a seção "E se…", que pede ao motor (/api/demo/contrato) o contrato
//      montado para cada exemplo e mostra o que entrou e o que saiu;
//   3. o campo do código, que leva à página de conferência.

import { $, esc, dataHora, rosetaSvg } from './comum.js'

// ── 1. Demonstração da assinatura ───────────────────────────────────────────
const demo = $('#demo')
if (demo) {
  const botoes = [...demo.querySelectorAll('[data-ciencia]')]
  const total = botoes.length
  const contagem = $('#demo-contagem')
  const trilho = $('#demo-trilho')
  const assinar = $('#demo-assinar')
  const assinado = $('#demo-assinado')
  const barra = $('#demo-barra')
  const clausulas = $('#demo-clausulas')
  $('#demo-roseta').insertAdjacentHTML('afterbegin', rosetaSvg())

  const feitas = () => demo.querySelectorAll('.ciente').length

  const atualizar = () => {
    const n = feitas()
    contagem.textContent = n
    trilho.querySelectorAll('i').forEach((i, k) => i.classList.toggle('feito', k < n))
    trilho.classList.toggle('completo', n === total)
    assinar.disabled = n < total
  }

  for (const b of botoes) {
    b.addEventListener('click', () => {
      const agora = new Date().toISOString()
      b.closest('.ciencia').innerHTML = `<span class="ciente ciente-anima">Você confirmou que entendeu, ${dataHora(agora)}</span>`
      atualizar()
    })
  }

  // Código no formato do selo (XXXX-XXXX-XXXX), sem letras ambíguas.
  const codigo = () => {
    const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(12))
    const s = [...bytes].map(b => alfabeto[b % alfabeto.length]).join('')
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
  }

  assinar.addEventListener('click', () => {
    $('#demo-codigo').textContent = codigo()
    $('#demo-quando').textContent = `às ${dataHora(new Date().toISOString())}, pela demonstração desta página`
    clausulas.hidden = true
    barra.hidden = true
    assinado.hidden = false
    assinado.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  $('#demo-reiniciar').addEventListener('click', () => {
    for (const art of demo.querySelectorAll('.clausula')) {
      art.querySelector('.ciencia').innerHTML = '<button class="botao secundario" type="button" data-ciencia>Li e entendi esta cláusula</button>'
    }
    // Os botões novos precisam do mesmo comportamento.
    for (const b of demo.querySelectorAll('[data-ciencia]')) {
      b.addEventListener('click', () => {
        b.closest('.ciencia').innerHTML = `<span class="ciente ciente-anima">Você confirmou que entendeu, ${dataHora(new Date().toISOString())}</span>`
        atualizar()
      })
    }
    assinado.hidden = true
    clausulas.hidden = false
    barra.hidden = false
    atualizar()
    demo.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
}

// ── 2. E se…? O motor montando o contrato ───────────────────────────────────
const montado = $('#montado')
if (montado) {
  const casos = [...document.querySelectorAll('.caso')]
  const cache = new Map()
  let anterior = null   // cláusulas do caso anterior, para mostrar o que entrou e o que saiu
  let pedido = 0

  const buscar = async (exemplo) => {
    if (!cache.has(exemplo)) {
      const r = await fetch(`/api/demo/contrato?exemplo=${encodeURIComponent(exemplo)}`)
      if (!r.ok) throw new Error(`O motor não respondeu (${r.status}).`)
      cache.set(exemplo, await r.json())
    }
    return cache.get(exemplo)
  }

  const render = (d) => {
    if (!d.ok) {
      const itens = [...d.faltando.map(f => ({ ...f, tipo: 'falta' })), ...d.invalidos.map(i => ({ ...i, tipo: 'inválido' }))]
      montado.innerHTML = `
        <div class="recusa">
          <div class="montado-cabeca"><h3>${esc(d.titulo)}</h3><p><b>${esc(d.contratado.nome || '')}</b>${d.contratado.tipo ? ` · ${esc(d.contratado.tipo)}` : ''}</p></div>
          <p class="aviso erro">Não vai para assinatura: ${itens.length} ${itens.length === 1 ? 'problema' : 'problemas'} para resolver antes.</p>
          <dl>${itens.map(i => `<div><dt>${esc(i.rotulo)}<code>${esc(i.tipo)}</code></dt><dd>${esc(i.motivo.startsWith(i.rotulo + ': ') ? i.motivo.slice(i.rotulo.length + 2) : i.motivo)}</dd></div>`).join('')}</dl>
        </div>`
      anterior = null
      return
    }
    // Entrou: cláusula nova. Mudou: outra cláusula com o mesmo título (ex.: o
    // prazo determinado deu lugar ao indeterminado). Saiu: título que sumiu.
    const chavesAgora = new Set(d.clausulas.map(c => c.chave))
    const titulosAgora = new Set(d.clausulas.map(c => c.titulo))
    const titulosAntes = anterior ? new Set(anterior.values()) : new Set()
    const estado = (c) => {
      if (!anterior || anterior.has(c.chave)) return ''
      return titulosAntes.has(c.titulo) ? 'mudou' : 'entrou'
    }
    const sairam = anterior ? [...anterior.entries()].filter(([k, t]) => !chavesAgora.has(k) && !titulosAgora.has(t)).map(([, t]) => t) : []
    const criticas = d.clausulas.filter(c => c.critica).length
    montado.innerHTML = `
      <div class="montado-cabeca">
        <h3>${esc(d.titulo)}</h3>
        <p><b>${esc(d.contratado.nome || '')}</b>${d.contratado.tipo ? ` · ${esc(d.contratado.tipo)}` : ''} · ${d.clausulas.length} cláusulas, ${criticas} em destaque</p>
      </div>
      <ol>${d.clausulas.map(c => `
        <li class="${estado(c)}">
          <span class="n">${c.numero}</span>
          <span class="t">${esc(c.titulo)}</span>
          <span class="pilulas">${c.critica ? '<span class="destaque">Em destaque</span>' : ''}${c.condicao ? `<span class="condicao">entra quando ${esc(c.condicao)}</span>` : ''}</span>
        </li>`).join('')}
      </ol>
      ${sairam.length ? `<p class="montado-saiu">Saiu neste caso: ${sairam.map(t => `<b>${esc(t)}</b>`).join(', ')}.</p>` : ''}`
    anterior = new Map(d.clausulas.map(c => [c.chave, c.titulo]))
  }

  const escolher = async (exemplo) => {
    const meu = ++pedido
    casos.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.exemplo === exemplo)))
    try {
      const d = await buscar(exemplo)
      if (meu === pedido) render(d)
    } catch (e) {
      if (meu === pedido) montado.innerHTML = `<p class="montado-erro">${esc(e.message)} Tente de novo em instantes.</p>`
    }
  }

  casos.forEach(c => c.addEventListener('click', () => escolher(c.dataset.exemplo)))
  escolher(casos.find(c => c.getAttribute('aria-pressed') === 'true')?.dataset.exemplo || 'pf-determinado')
}

// ── 3. Conferir um contrato ─────────────────────────────────────────────────
const form = $('#form-conferir')
if (form) {
  const campo = $('#codigo-conferir')
  // Máscara XXXX-XXXX-XXXX enquanto digita (ou cola).
  campo.addEventListener('input', () => {
    const limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    campo.value = limpo.replace(/(.{4})(?=.)/g, '$1-')
  })
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const codigo = campo.value.trim().toUpperCase()
    if (codigo.replace(/-/g, '').length < 12) { campo.focus(); campo.reportValidity(); return }
    location.href = `/v/${encodeURIComponent(codigo)}`
  })
}
