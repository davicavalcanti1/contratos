// Webhooks: avisam o sistema de quem integra quando algo acontece com um
// contrato. Cada aviso é assinado (HMAC) e tentado de novo se o destino falhar.

import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, Vazio, dataHora, plural, useAcao, useDados } from '../../comum.jsx'

const SITUACAO_ENTREGA = { entregue: ['Entregue', 'assinado'], pendente: ['Tentando de novo', 'enviado'], falhou: ['Falhou', 'recusado'] }
const GRUPOS_EVENTO = [
  ['Assinatura', ['contrato.assinado', 'signatario.assinou', 'contrato.recusado', 'contrato.expirado', 'contrato.cancelado']],
  ['Contrato vivo', ['contrato.aditado', 'contrato.distratado', 'contrato.vencendo', 'contrato.reajuste_devido', 'contrato.encerrado']],
]

export function Webhooks() {
  const { dados, erro, carregando, recarregar } = useDados(async () => {
    const [w, entregas] = await Promise.all([api('/admin/webhooks'), api('/admin/entregas')])
    return { ...w, entregas }
  }, [])
  const acao = useAcao()
  const [novo, setNovo] = useState({ url: '', eventos: ['contrato.assinado'] })
  const [segredo, setSegredo] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [filtroEntregas, setFiltroEntregas] = useState('')

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/webhooks', { metodo: 'POST', corpo: novo }))
    if (r) { setSegredo({ url: r.url, segredo: r.segredo, novo: true }); setNovo({ url: '', eventos: ['contrato.assinado'] }); recarregar() }
  }
  const verSegredo = (w) => acao.executar(async () => setSegredo({ url: w.url, ...(await api(`/admin/webhooks/${w.id}/segredo`)) }))
  const alternar = (w) => acao.executar(async () => { await api(`/admin/webhooks/${w.id}`, { metodo: 'PATCH', corpo: { ativo: !w.ativo } }); recarregar() })
  const remover = (w) => acao.executar(async () => { await api(`/admin/webhooks/${w.id}`, { metodo: 'DELETE' }); setConfirmar(null); recarregar() })
  const reenviar = (e) => acao.executar(async () => { await api(`/admin/entregas/${e.id}/reenviar`, { metodo: 'POST' }); recarregar() })
  const marcar = (ev) => setNovo(n => ({ ...n, eventos: n.eventos.includes(ev) ? n.eventos.filter(x => x !== ev) : [...n.eventos, ev] }))
  const urlDe = Object.fromEntries(dados.webhooks.map(w => [w.id, w.url]))
  const entregas = dados.entregas.filter(e => !filtroEntregas || e.status === filtroEntregas)
  const contagem = Object.fromEntries(['entregue', 'pendente', 'falhou'].map(s => [s, dados.entregas.filter(e => e.status === s).length]))
  const host = (u) => { try { return new URL(u).host } catch { return u } }

  return (
    <>
      <Cabecalho titulo="Webhooks" sub="Avisam o seu sistema quando algo acontece com um contrato, sem ele precisar perguntar. Cada aviso vai assinado e é tentado de novo se o destino falhar." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {segredo && (
        <div className="aviso ok chave-nova" role="status">
          <p><strong>{segredo.novo ? 'Webhook criado. ' : ''}Segredo de {segredo.url}.</strong> Use-o para conferir que o aviso veio daqui, pelo cabeçalho <code>X-Contratos-Assinatura</code>.</p>
          <p className="chave-valor"><code>{segredo.segredo}</code> <Copiar texto={segredo.segredo} /></p>
          <button className="link-botao" onClick={() => setSegredo(null)}>Fechar</button>
        </div>
      )}
      <div className="duas-colunas largas">
        <div className="coluna">
          <section className="cartao">
            <div className="cartao-topo"><h2>{dados.webhooks.length ? plural(dados.webhooks.length, 'endereço', 'endereços') : 'Endereços'}</h2></div>
            {dados.webhooks.length === 0 ? <Vazio>Nenhum webhook ainda. Cadastre o endereço do seu sistema ao lado.</Vazio> : (
              <ul className="lista-webhooks">
                {dados.webhooks.map(w => (
                  <li key={w.id} className={w.ativo ? '' : 'inativo'}>
                    <div className="webhook-texto">
                      <strong title={w.url}>{host(w.url)}</strong>
                      <span className="url">{w.url}</span>
                      <span className="eventos-pilulas">{w.eventos.map(e => <code key={e}>{e}</code>)}</span>
                      {w.falhas > 0 && <span className="erro-texto">{plural(w.falhas, 'entrega falhou', 'entregas falharam')}{w.pendentes ? `, ${w.pendentes} tentando de novo` : ''}</span>}
                    </div>
                    <div className="pessoa-estado">
                      <span className={`status ${w.ativo ? 'assinado' : 'encerrado'}`}>{w.ativo ? 'Ativo' : 'Pausado'}</span>
                      <span className="acoes-linha">
                        <button className="link-botao pequeno-link" onClick={() => verSegredo(w)}>Segredo</button>
                        <button className="link-botao pequeno-link" onClick={() => alternar(w)}>{w.ativo ? 'Pausar' : 'Retomar'}</button>
                        {confirmar === w.id
                          ? <span className="confirmar">Remover? <button className="link-botao perigo" onClick={() => remover(w)}>Sim</button> <button className="link-botao" onClick={() => setConfirmar(null)}>Não</button></span>
                          : <button className="link-botao pequeno-link perigo" onClick={() => setConfirmar(w.id)}>Remover</button>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao cartao-lista">
            <div className="cartao-topo">
              <h2>Últimas entregas</h2>
              {dados.entregas.length > 0 && (
                <div className="chips">
                  <button type="button" className="chip" aria-pressed={filtroEntregas === ''} onClick={() => setFiltroEntregas('')}>Todas<b>{dados.entregas.length}</b></button>
                  {Object.entries(contagem).filter(([, n]) => n).map(([s, n]) => <button key={s} type="button" className="chip" aria-pressed={filtroEntregas === s} onClick={() => setFiltroEntregas(s)}>{SITUACAO_ENTREGA[s][0]}<b>{n}</b></button>)}
                </div>
              )}
            </div>
            {entregas.length === 0 ? <Vazio>{dados.entregas.length ? 'Nenhuma entrega neste filtro.' : 'Nenhum aviso enviado ainda. Quando um contrato for assinado, a entrega aparece aqui.'}</Vazio> : (
              <ul className="lista-entregas">
                {entregas.map(e => {
                  const ultima = e.historico.at(-1)
                  const [rotulo, classe] = SITUACAO_ENTREGA[e.status] || [e.status, 'encerrado']
                  return (
                    <li key={e.id}>
                      <div className="entrega-texto">
                        <strong>{dados.eventos[e.evento.tipo] || e.evento.tipo}</strong>
                        <span>{dataHora(e.criada_em)} · para {host(urlDe[e.webhook_id] || '(removido)')}{e.tentativas > 1 ? ` · ${plural(e.tentativas, 'tentativa', 'tentativas')}` : ''}</span>
                        {ultima && <span className="entrega-resposta">resposta {ultima.codigo ?? 'nenhuma'}{ultima.resposta ? `: ${ultima.resposta.slice(0, 80)}` : ''}</span>}
                        {e.status === 'pendente' && e.proxima_em && <span>próxima tentativa {dataHora(e.proxima_em)}</span>}
                      </div>
                      <div className="pessoa-estado">
                        <span className={`status ${classe}`}>{rotulo}</span>
                        {e.status !== 'entregue' && <button className="link-botao pequeno-link" onClick={() => reenviar(e)}>Tentar agora</button>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="coluna">
          <form className="cartao" onSubmit={criar}>
            <h2>Novo webhook</h2>
            <div className="campos">
              <Campo rotulo="Endereço (https)" classe="c-12" dica="Em produção, só https. O aviso é um POST com JSON."><input type="url" value={novo.url} onChange={e => setNovo(n => ({ ...n, url: e.target.value }))} required placeholder="https://seu-sistema.com.br/contratos/aviso" /></Campo>
            </div>
            <fieldset className="opcoes-papel">
              <legend>Avisar quando</legend>
              {GRUPOS_EVENTO.map(([titulo, evs]) => (
                <div className="grupo-eventos" key={titulo}>
                  <p className="grupo-eventos-titulo">{titulo}</p>
                  {evs.filter(ev => dados.eventos[ev]).map(ev => (
                    <label key={ev} className="check compacto-check"><input type="checkbox" checked={novo.eventos.includes(ev)} onChange={() => marcar(ev)} /><span>{dados.eventos[ev]}<small><code>{ev}</code></small></span></label>
                  ))}
                </div>
              ))}
            </fieldset>
            <button className="botao largo" disabled={acao.ocupado || !novo.url.trim() || novo.eventos.length === 0}>{acao.ocupado ? 'Criando…' : 'Criar webhook'}</button>
          </form>

          <section className="cartao">
            <h2>Como conferir a assinatura</h2>
            <pre className="codigo-exemplo">{`// Node: o corpo CRU da requisição, antes de JSON.parse
const [, t, v1] = req.headers['x-contratos-assinatura']
  .match(/t=(\\d+),v1=(\\w+)/)
const esperado = crypto.createHmac('sha256', SEGREDO)
  .update(\`\${t}.\${corpoCru}\`).digest('hex')
const valido = crypto.timingSafeEqual(
  Buffer.from(v1), Buffer.from(esperado))`}</pre>
            <ul className="lista-avisos">
              <li>Responda <b>2xx em até 10 s</b>. Sem isso, tentamos de novo em 1 min, 5 min, 30 min, 2 h e 6 h.</li>
              <li>O cabeçalho <b><code>X-Contratos-Entrega</code></b> é o mesmo em todas as tentativas: use-o para não processar duas vezes.</li>
              <li>O corpo traz o <b>evento</b>, o <b>contrato</b> (id, referência, situação, código de verificação) e, quando há, a <b>vigência</b>.</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
