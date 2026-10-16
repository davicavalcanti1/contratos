// Site de apresentação: a cláusula do topo funciona de verdade (só aqui, sem
// servidor), e o campo de código leva à página de verificação.

import { $, dataHora } from './comum.js'

$('#demo-botao').addEventListener('click', () => {
  const agora = new Date().toISOString()
  $('#demo-ciencia').innerHTML = `<span class="ciente ciente-anima">Você confirmou que entendeu, ${dataHora(agora)}</span>`
  $('#demo-trilha').textContent = 'Registrado na trilha do contrato, com horário, para o dossiê de provas.'
})

$('#form-conferir').addEventListener('submit', (ev) => {
  ev.preventDefault()
  const codigo = $('#codigo-conferir').value.trim().toUpperCase()
  if (codigo) location.href = `/v/${encodeURIComponent(codigo)}`
})
