// Página do QR. Mostra se o código existe, a situação do contrato, quem
// assinou (mascarado) e deixa conferir um PDF pelo hash, calculado no
// navegador. Nada do texto do contrato passa por aqui.

import { $, api, dataHora, esc, rosetaSvg, sha256Arquivo } from './comum.js'

const codigoUrl = decodeURIComponent(location.pathname.match(/^\/v\/(.+)$/)?.[1] || '')
const br = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
$('#endereco-site').textContent = `${location.host}/verificar`

// Máscara XXXX-XXXX-XXXX enquanto digita (ou cola).
const campo = $('#codigo')
campo.addEventListener('input', () => {
  const limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  campo.value = limpo.replace(/(.{4})(?=.)/g, '$1-')
})

async function verificar(codigo) {
  const alvo = $('#resultado')
  alvo.innerHTML = '<p class="aviso info">Consultando o registro…</p>'
  $('#colunas').hidden = true
  try {
    const v = await api(`/api/verificar/${encodeURIComponent(codigo)}`)
    alvo.innerHTML = selo(v)
    document.title = `${v.codigo} · ${v.titulo}`
    $('#titulo-pagina').textContent = 'Registro do contrato'
    $('#colunas').hidden = false
    $('#conferir').dataset.codigo = v.codigo
    $('#garantia-carimbo').hidden = !v.integridade.carimbo
    $('#resultado-arquivo').innerHTML = ''
    $('#soltar-texto').textContent = 'Escolha ou arraste o PDF aqui'
  } catch (e) {
    alvo.innerHTML = `
      <div class="cartao selo invalido">
        <div class="estado">
          <div class="carimbo" aria-hidden="true">${rosetaSvg()}<b>✕</b></div>
          <div><h2>Código não encontrado</h2><p class="codigo-grande">${esc(codigo)}</p></div>
        </div>
        <p>Nenhum contrato assinado tem este código. Confira se digitou igual ao rodapé do documento: são 12 letras e números, em três grupos.</p>
        <p class="aviso erro">Se o código estiver certo e mesmo assim não aparecer, desconfie do documento e fale com quem o emitiu.</p>
      </div>`
    $('#form-busca').hidden = false
    campo.value = codigo
    campo.focus()
  }
}

const SITUACAO = {
  assinado: { titulo: 'Contrato autêntico', pilula: 'Vigente', classe: 'assinado' },
  encerrado: { titulo: 'Autêntico, e já encerrado', pilula: 'Encerrado', classe: 'encerrado' },
  distratado: { titulo: 'Autêntico, encerrado por distrato', pilula: 'Distratado', classe: 'distratado' },
}

// O que aconteceu com o documento depois de assinado. Quem tem uma cópia
// impressa na mão precisa saber se ela ainda vale.
function historia(v) {
  const linhas = []
  if (v.origem) linhas.push(`Este é um <b>${v.origem.tipo === 'aditivo' ? 'termo aditivo' : 'distrato'}</b> do contrato <a href="/v/${encodeURIComponent(v.origem.codigo)}">${esc(v.origem.codigo)}</a>.`)
  if (v.distrato) linhas.push(`${v.status === 'distratado' ? 'Encerrado' : 'Encerra'} em <b>${br(v.distrato.data_encerramento)}</b> por distrato assinado em ${dataHora(v.distrato.assinado_em)} (<a href="/v/${encodeURIComponent(v.distrato.codigo)}">${esc(v.distrato.codigo)}</a>).`)
  for (const d of v.derivados || []) linhas.push(`<b>Aditado</b> por documento assinado em ${dataHora(d.assinado_em)} (<a href="/v/${encodeURIComponent(d.codigo)}">${esc(d.codigo)}</a>). Prazo e valor podem ter mudado: veja o aditivo.`)
  if (v.encerrado_em) linhas.push(`Terminou no fim do prazo, em <b>${br(v.encerrado_em)}</b>.`)
  return linhas.length ? `<ul class="historia">${linhas.map(l => `<li>${l}</li>`).join('')}</ul>` : ''
}

function iniciais(nome) {
  return String(nome).split(' ').filter(p => /^[A-ZÀ-Ú]/.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '•'
}

function selo(v) {
  const sit = SITUACAO[v.status]
  const integro = !!sit && v.integridade.trilha_integra
  const vig = v.vigencia
  const linkPublico = `${location.origin}/v/${encodeURIComponent(v.codigo)}`
  return `
    <div class="cartao selo${integro ? '' : ' invalido'}">
      <div class="estado">
        <div class="carimbo" aria-hidden="true">${rosetaSvg()}<b>${integro ? '✓' : '!'}</b></div>
        <div>
          <h2>${integro ? sit.titulo : 'Atenção: registro com problema'}</h2>
          <p class="codigo-grande">${esc(v.codigo)}</p>
          ${integro ? `<p class="selo-pilulas"><span class="status ${sit.classe}">${sit.pilula}</span>${vig ? `<span class="selo-vigencia">${vig.fim ? `de ${br(vig.inicio)} a ${br(vig.fim)}` : `desde ${br(vig.inicio)}, prazo indeterminado`}</span>` : ''}</p>` : ''}
        </div>
      </div>
      ${integro ? historia(v) : '<p class="aviso erro">O histórico deste contrato não confere. Não confie no documento antes de falar com quem o emitiu.</p>'}

      <dl class="dados">
        <dt>Documento</dt><dd>${esc(v.titulo)}</dd>
        <dt>Emitido por</dt><dd>${esc(v.organizacao)}</dd>
        <dt>Concluído em</dt><dd>${esc(dataHora(v.assinado_em))}</dd>
      </dl>

      <h3 class="selo-sub">Quem assinou</h3>
      <ul class="assinantes">
        ${v.signatarios.map(s => `
          <li>
            <span class="avatar-publico" aria-hidden="true">${esc(iniciais(s.nome))}</span>
            <span class="assinante-texto">
              <strong>${esc(s.nome)}</strong>
              <small>${esc(s.papel)}${s.cpf ? ` · CPF ${esc(s.cpf)}` : ''}</small>
              <small>Assinou ${s.com_certificado ? 'com certificado ICP-Brasil ' : ''}em ${esc(dataHora(s.assinado_em))}</small>
            </span>
          </li>`).join('')}
      </ul>

      <details class="integridade">
        <summary>Códigos de integridade (SHA-256)</summary>
        <dl class="hashes">
          <dt>PDF assinado</dt><dd class="hash">${esc(v.integridade.pdf_final_sha256)}</dd>
          <dt>PDF original</dt><dd class="hash">${esc(v.integridade.pdf_original_sha256)}</dd>
          <dt>Conteúdo</dt><dd class="hash">${esc(v.integridade.conteudo_sha256)}</dd>
          <dt>Histórico</dt><dd>${v.integridade.eventos ?? '—'} eventos encadeados, ${v.integridade.trilha_integra ? 'íntegro' : 'com quebra'}</dd>
          ${v.integridade.carimbo ? `<dt>Carimbo do tempo</dt><dd>${esc(v.integridade.carimbo.act)}${v.integridade.carimbo.icp_brasil ? ' (ICP-Brasil)' : ' (fora da ICP-Brasil)'}, ${esc(dataHora(v.integridade.carimbo.gen_time))}, sobre o PDF assinado</dd>` : ''}
        </dl>
      </details>

      <div class="selo-acoes">
        <button type="button" class="botao secundario pequeno" data-copiar="${esc(linkPublico)}">Copiar o link deste registro</button>
        <a class="link-botao" href="/verificar">Verificar outro código</a>
      </div>
    </div>`
}

async function conferirArquivo(arquivo) {
  const saida = $('#resultado-arquivo')
  if (!arquivo) return
  $('#soltar-texto').textContent = `${arquivo.name} · ${(arquivo.size / 1024).toFixed(0)} KB`
  saida.innerHTML = '<p class="aviso info">Calculando o código de integridade…</p>'
  try {
    const sha256 = await sha256Arquivo(arquivo)
    const { confere } = await api(`/api/verificar/${encodeURIComponent($('#conferir').dataset.codigo)}/conferir`, { metodo: 'POST', corpo: { sha256 } })
    const veredito = {
      final: '<p class="aviso ok"><b>Idêntico à via assinada.</b> Nenhum byte foi alterado: este é o documento registrado.</p>',
      original: '<p class="aviso ok"><b>Idêntico ao texto enviado para assinatura</b>, a via de antes das assinaturas. O conteúdo é o registrado; a via assinada tem as páginas de assinatura a mais.</p>',
    }[confere] || '<p class="aviso erro"><b>Este arquivo não é igual ao contrato registrado.</b> Pode ter sido alterado, salvo de novo por outro programa, ou ser outro documento. Peça a via original a quem o enviou.</p>'
    saida.innerHTML = `${veredito}<p class="hash">Código deste arquivo: ${sha256}</p>`
  } catch (e) {
    saida.innerHTML = `<p class="aviso erro">${esc(e.message)}</p>`
  }
}

$('#form-busca').addEventListener('submit', e => {
  e.preventDefault()
  const c = campo.value.trim().toUpperCase()
  if (c.replace(/-/g, '').length < 12) { campo.focus(); campo.reportValidity(); return }
  history.replaceState(null, '', `/v/${encodeURIComponent(c)}`)
  $('#form-busca').hidden = true
  verificar(c)
})
$('#resultado').addEventListener('click', async e => {
  const b = e.target.closest('[data-copiar]')
  if (!b) return
  try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = 'Link copiado'; setTimeout(() => { b.textContent = 'Copiar o link deste registro' }, 2000) } catch { /* sem permissão: a pessoa copia da barra */ }
})
$('#arquivo').addEventListener('change', e => conferirArquivo(e.target.files[0]))
const zona = $('#soltar')
zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre') })
zona.addEventListener('dragleave', () => zona.classList.remove('sobre'))
zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); conferirArquivo(e.dataTransfer.files[0]) })

if (codigoUrl) verificar(codigoUrl)
else { $('#form-busca').hidden = false; campo.focus() }
