// Agenda do contrato vivo: roda ao subir o servidor e de hora em hora.
//
// Para cada contrato assinado com vigência, olha o que está devido HOJE
// (vida.js → alertasDevidos) e:
//   - vencendo (30 e 7 dias antes) → e-mail para quem administra/emite + webhook
//   - reajuste (30 dias antes do aniversário) → idem
//   - venceu → status "encerrado", evento na trilha, webhook
//
// Idempotente: cada alerta tem uma chave guardada no contrato; rodar a agenda
// dez vezes no mesmo dia não manda nada duas vezes.

import { alertasDevidos, diasEntre, hojeBr, proximoReajuste, resumoVida } from './vida.js'

const ASSUNTO = {
  vencendo: (c, a) => `Contrato vence em ${a.dias} dia${a.dias === 1 ? '' : 's'}: ${c.titulo}`,
  reajuste: (c, a) => `Reajuste em ${a.dias} dia${a.dias === 1 ? '' : 's'}: ${c.titulo}`,
  encerrado: (c) => `Contrato encerrado: ${c.titulo}`,
}
const EVENTO = { vencendo: 'contrato.vencendo', reajuste: 'contrato.reajuste_devido', encerrado: 'contrato.encerrado' }

export function criarAgenda({ repo, servico, notificar, aoEvento = () => {}, agora = () => new Date(), config = {} }) {
  const baseUrl = config.baseUrl || 'http://localhost:3000'
  let timer = null

  const br = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
  const nomes = (c) => repo.listar('signatarios', s => s.contrato_id === c.id && s.canal !== 'lote').map(s => s.nome).join(', ')

  function texto(c, a) {
    const link = `${baseUrl}/painel/contratos/${c.id}`
    const quem = nomes(c)
    if (a.tipo === 'vencendo') {
      return `O "${c.titulo}"${quem ? ` com ${quem}` : ''} termina em ${br(a.data)}.\n\nPara continuar, gere um termo aditivo de prorrogação pelo painel:\n${link}`
    }
    if (a.tipo === 'reajuste') {
      return `O "${c.titulo}"${quem ? ` com ${quem}` : ''} completa o período de reajuste em ${br(a.data)}${c.vida?.indice ? ` (índice ${c.vida.indice})` : ''}.\n\nO painel calcula o novo valor pelo índice e gera o termo aditivo:\n${link}`
    }
    return `O "${c.titulo}"${quem ? ` com ${quem}` : ''} terminou em ${br(a.data)} e foi marcado como encerrado.\n${link}`
  }

  async function avisarPessoas(c, a) {
    const pessoas = repo.listar('usuarios', u => u.organizacao_id === c.organizacao_id && u.ativo && ['org_admin', 'emissor'].includes(u.papel))
    for (const u of pessoas) {
      await notificar({ para: u.email, canal: 'email', assunto: ASSUNTO[a.tipo](c, a), texto: texto(c, a), meta: { tipo: `agenda.${a.tipo}`, contrato_id: c.id } })
    }
  }

  async function executar() {
    const hoje = hojeBr(agora())
    const feitos = []
    for (const c of repo.listar('contratos', x => x.status === 'assinado' && x.vida)) {
      const enviados = new Set(c.alertas_enviados || [])
      for (const a of alertasDevidos(c.vida, hoje)) {
        if (enviados.has(a.chave)) continue
        if (c.distrato && a.tipo === 'vencendo') { enviados.add(a.chave); continue } // o fim foi combinado no distrato
        if (a.tipo === 'encerrado' && c.distrato) {
          servico.encerrarPorDistrato(c.id, c.distrato)
          enviados.add(a.chave)
          repo.atualizar('contratos', c.id, { alertas_enviados: [...enviados] })
          feitos.push({ contrato_id: c.id, ...a, tipo: 'distratado' })
          continue
        }
        if (a.tipo === 'encerrado') {
          repo.atualizar('contratos', c.id, { status: 'encerrado', encerrado_em: `${a.data}T23:59:59-03:00` })
          servico.trilha.registrar(c.id, 'contrato.encerrado', { dados: { fim: a.data } })
        }
        enviados.add(a.chave)
        repo.atualizar('contratos', c.id, { alertas_enviados: [...enviados] })
        const atual = repo.obter('contratos', c.id)
        try {
          aoEvento(c.organizacao_id, EVENTO[a.tipo], {
            contrato: { id: c.id, titulo: c.titulo, status: atual.status, referencia: c.referencia || null, codigo_verificacao: c.codigo_verificacao },
            vigencia: resumoVida(atual.vida, hoje),
            data: a.data, dias: a.dias ?? null,
          })
        } catch (e) { console.error('[agenda]', e) }
        await avisarPessoas(atual, a)
        feitos.push({ contrato_id: c.id, ...a })
      }
    }
    return feitos
  }

  // Para a tela "Agenda": o que vence e o que reajusta nos próximos `dias`.
  function proximos(orgId, dias = 90) {
    const hoje = hojeBr(agora())
    const vigentes = repo.listar('contratos', x => x.organizacao_id === orgId && x.status === 'assinado' && x.vida)
    const item = (c, data) => ({
      id: c.id, titulo: c.titulo, referencia: c.referencia || null, partes: nomes(c), data, dias: diasEntre(hoje, data),
      valor: c.vida.valor, indice: c.vida.indice,
      aditivo_pendente: repo.listar('contratos', d => d.origem?.contrato_id === c.id && ['gerado', 'enviado', 'parcialmente_assinado'].includes(d.status)).length > 0,
    })
    const vencimentos = vigentes.filter(c => c.vida.fim && diasEntre(hoje, c.vida.fim) <= dias).map(c => item(c, c.vida.fim))
    const reajustes = vigentes.map(c => [c, proximoReajuste(c.vida, hoje)]).filter(([, r]) => r && diasEntre(hoje, r) <= dias).map(([c, r]) => item(c, r))
    const encerrados = repo.listar('contratos', x => x.organizacao_id === orgId && ['encerrado', 'distratado'].includes(x.status))
      .map(c => ({ id: c.id, titulo: c.titulo, referencia: c.referencia || null, partes: nomes(c), status: c.status, em: c.encerrado_em || c.distratado_em }))
      .sort((a, b) => String(b.em).localeCompare(String(a.em))).slice(0, 20)
    const porData = (a, b) => a.data.localeCompare(b.data)
    return { hoje, dias, vencimentos: vencimentos.sort(porData), reajustes: reajustes.sort(porData), encerrados }
  }

  function iniciar(intervaloMs = 3600e3) {
    parar()
    executar().catch(e => console.error('[agenda]', e))
    timer = setInterval(() => executar().catch(e => console.error('[agenda]', e)), intervaloMs)
    timer.unref?.()
  }
  function parar() { if (timer) clearInterval(timer); timer = null }

  return { executar, proximos, iniciar, parar }
}
