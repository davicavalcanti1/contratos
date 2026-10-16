// Página do QR. Mostra se o código existe, quem assinou (mascarado) e deixa
// conferir um PDF pelo hash, calculado no navegador.

import { $, api, dataHora, esc, rosetaSvg, sha256Arquivo } from './comum.js'

const codigoUrl = decodeURIComponent(location.pathname.match(/^\/v\/(.+)$/)?.[1] || '')

async function verificar(codigo) {
  const alvo = $('#resultado')
  alvo.innerHTML = '<p class="aviso info">Consultando…</p>'
  $('#conferir').hidden = true
  try {
    const v = await api(`/api/verificar/${encodeURIComponent(codigo)}`)
    alvo.innerHTML = selo(v)
    document.title = `Verificado: ${v.titulo}`
    $('#conferir').hidden = false
    $('#conferir').dataset.codigo = v.codigo
  } catch (e) {
    alvo.innerHTML = `
      <div class="cartao selo invalido">
        <div class="estado"><div class="carimbo" aria-hidden="true">${rosetaSvg()}<b>✕</b></div>
          <div><h2>Código não encontrado</h2><p>Nenhum contrato assinado tem o código <strong>${esc(codigo)}</strong>.</p></div></div>
        <p>Confira se digitou igual ao rodapé do documento. Se o código estiver certo e mesmo assim não aparecer, desconfie do documento.</p>
      </div>`
    $('#form-busca').hidden = false
  }
}

// O que aconteceu com o documento depois de assinado. Quem tem uma cópia
// impressa na mão precisa saber se ela ainda vale.
function historia(v) {
  const br = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
  const linhas = []
  if (v.origem) linhas.push(`Este é um ${v.origem.tipo === 'aditivo' ? 'termo aditivo' : 'distrato'} do contrato <a href="/v/${encodeURIComponent(v.origem.codigo)}">${esc(v.origem.codigo)}</a>.`)
  if (v.vigencia) linhas.push(`Vigência: de ${br(v.vigencia.inicio)} ${v.vigencia.fim ? `a ${br(v.vigencia.fim)}` : 'por prazo indeterminado'}.`)
  if (v.distrato) linhas.push(`${v.status === 'distratado' ? 'Encerrado' : 'Encerra'} em ${br(v.distrato.data_encerramento)} por distrato assinado em ${dataHora(v.distrato.assinado_em)}: <a href="/v/${encodeURIComponent(v.distrato.codigo)}">${esc(v.distrato.codigo)}</a>.`)
  for (const d of v.derivados || []) linhas.push(`${d.tipo === 'aditivo' ? 'Aditado' : 'Distratado'} por documento assinado em ${dataHora(d.assinado_em)}: <a href="/v/${encodeURIComponent(d.codigo)}">${esc(d.codigo)}</a>.`)
  if (v.encerrado_em) linhas.push(`Terminou no fim do prazo, em ${br(v.encerrado_em)}.`)
  return linhas.length ? `<ul class="historia">${linhas.map(l => `<li>${l}</li>`).join('')}</ul>` : ''
}

const ESTADO = {
  assinado: 'Contrato autêntico',
  encerrado: 'Autêntico, e já encerrado',
  distratado: 'Autêntico, e encerrado por distrato',
}

function selo(v) {
  const integro = ['assinado', 'encerrado', 'distratado'].includes(v.status) && v.integridade.trilha_integra
  const sig = v.signatarios.map(s => `<dt>${esc(s.papel)}</dt><dd>${esc(s.nome)}${s.cpf ? `, <span class="sem-quebra">CPF ${esc(s.cpf)}</span>` : ''}<br><small>assinou ${s.com_certificado ? 'com certificado ICP-Brasil ' : ''}em ${esc(dataHora(s.assinado_em))}</small></dd>`).join('')
  return `
    <div class="cartao selo${integro ? '' : ' invalido'}">
      <div class="estado">
        <div class="carimbo" aria-hidden="true">${rosetaSvg()}<b>${integro ? '✓' : '!'}</b></div>
        <div>
          <h2>${integro ? ESTADO[v.status] : 'Atenção: registro com problema'}</h2>
          <p class="codigo-grande">${esc(v.codigo)}</p>
        </div>
      </div>
      ${integro ? historia(v) : '<p class="aviso erro">O histórico deste contrato não confere. Não confie no documento antes de falar com quem o emitiu.</p>'}
      <dl class="dados">
        <dt>Documento</dt><dd>${esc(v.titulo)}</dd>
        <dt>Emitido por</dt><dd>${esc(v.organizacao)}</dd>
        <dt>Concluído em</dt><dd>${esc(dataHora(v.assinado_em))}</dd>
        ${sig}
      </dl>
      <details>
        <summary>Códigos de integridade</summary>
        <p class="hash">Conteúdo: ${esc(v.integridade.conteudo_sha256)}<br>
        PDF assinado: ${esc(v.integridade.pdf_final_sha256)}<br>
        PDF original: ${esc(v.integridade.pdf_original_sha256)}<br>
        Histórico: ${v.integridade.eventos} eventos encadeados, ${v.integridade.trilha_integra ? 'íntegro' : 'com quebra'}${v.integridade.carimbo ? `<br>Carimbo do tempo: ${esc(v.integridade.carimbo.act)}${v.integridade.carimbo.icp_brasil ? ' (ICP-Brasil)' : ' (fora da ICP-Brasil)'}, ${esc(dataHora(v.integridade.carimbo.gen_time))}, sobre o PDF assinado` : ''}</p>
      </details>
      <p class="nota-bula">Nomes e documentos aparecem incompletos para proteger os dados das pessoas. O texto do contrato só fica com quem assinou.</p>
    </div>`
}

async function conferirArquivo(arquivo) {
  const saida = $('#resultado-arquivo')
  if (!arquivo) return
  $('#soltar-texto').textContent = arquivo.name
  saida.innerHTML = '<p class="aviso info">Calculando…</p>'
  try {
    const sha256 = await sha256Arquivo(arquivo)
    const { confere } = await api(`/api/verificar/${encodeURIComponent($('#conferir').dataset.codigo)}/conferir`, { metodo: 'POST', corpo: { sha256 } })
    saida.innerHTML = {
      final: '<p class="aviso ok">Idêntico à via assinada. Nenhum byte foi alterado.</p>',
      original: '<p class="aviso ok">Idêntico ao texto que foi enviado para assinatura (a via antes das assinaturas).</p>',
    }[confere] || '<p class="aviso erro">Este arquivo NÃO é igual ao contrato registrado. Pode ter sido alterado, ou é outro documento.</p>'
  } catch (e) {
    saida.innerHTML = `<p class="aviso erro">${esc(e.message)}</p>`
  }
}

$('#form-busca').addEventListener('submit', e => {
  e.preventDefault()
  const c = $('#codigo').value.trim()
  history.replaceState(null, '', `/v/${encodeURIComponent(c)}`)
  $('#form-busca').hidden = true
  verificar(c)
})
$('#arquivo').addEventListener('change', e => conferirArquivo(e.target.files[0]))
const zona = $('#soltar')
zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre') })
zona.addEventListener('dragleave', () => zona.classList.remove('sobre'))
zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); conferirArquivo(e.dataTransfer.files[0]) })

if (codigoUrl) verificar(codigoUrl)
else $('#form-busca').hidden = false
