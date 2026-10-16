import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, Vazio, dataHora, useAcao, useDados } from '../../comum.jsx'

const SITUACAO_ENTREGA = { entregue: 'entregue', pendente: 'tentando de novo', falhou: 'falhou' }

export function Webhooks() {
  const { dados, erro, carregando, recarregar } = useDados(async () => {
    const [w, entregas] = await Promise.all([api('/admin/webhooks'), api('/admin/entregas')])
    return { ...w, entregas }
  }, [])
  const acao = useAcao()
  const [novo, setNovo] = useState({ url: '', eventos: ['contrato.assinado'] })
  const [segredo, setSegredo] = useState(null)

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/webhooks', { metodo: 'POST', corpo: novo }))
    if (r) { setSegredo({ url: r.url, segredo: r.segredo }); setNovo({ url: '', eventos: ['contrato.assinado'] }); recarregar() }
  }
  const verSegredo = (w) => acao.executar(async () => setSegredo({ url: w.url, ...(await api(`/admin/webhooks/${w.id}/segredo`)) }))
  const alternar = (w) => acao.executar(async () => { await api(`/admin/webhooks/${w.id}`, { metodo: 'PATCH', corpo: { ativo: !w.ativo } }); recarregar() })
  const remover = (w) => window.confirm(`Remover o webhook para ${w.url}?`) && acao.executar(async () => { await api(`/admin/webhooks/${w.id}`, { metodo: 'DELETE' }); recarregar() })
  const reenviar = (e) => acao.executar(async () => { await api(`/admin/entregas/${e.id}/reenviar`, { metodo: 'POST' }); recarregar() })
  const marcar = (ev) => setNovo(n => ({ ...n, eventos: n.eventos.includes(ev) ? n.eventos.filter(x => x !== ev) : [...n.eventos, ev] }))
  const urlDe = Object.fromEntries(dados.webhooks.map(w => [w.id, w.url]))

  return (
    <>
      <Cabecalho titulo="Webhooks" sub="Avisam o seu sistema quando algo acontece com um contrato, sem ele precisar perguntar." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {segredo && (
        <div className="aviso ok chave-nova" role="status">
          <p>Segredo de <strong>{segredo.url}</strong>. Use-o para conferir que o aviso veio daqui (assinatura no cabeçalho <code>X-Contratos-Assinatura</code>).</p>
          <p className="chave-valor"><code>{segredo.segredo}</code> <Copiar texto={segredo.segredo} /></p>
          <button className="link-botao" onClick={() => setSegredo(null)}>Fechar</button>
        </div>
      )}
      <div className="duas-colunas largas">
        <section className="cartao">
          {dados.webhooks.length === 0 ? <Vazio>Nenhum webhook ainda.</Vazio> : (
            <table className="tabela">
              <thead><tr><th>Endereço</th><th>Avisa quando</th><th>Situação</th><th></th></tr></thead>
              <tbody>{dados.webhooks.map(w => (
                <tr key={w.id} className={w.ativo ? '' : 'inativo'}>
                  <td className="url">{w.url}</td>
                  <td>{w.eventos.map(e => dados.eventos[e]).join('; ')}</td>
                  <td>{w.ativo ? 'ativo' : 'pausado'}{w.falhas > 0 && <><br /><small className="erro-texto">{w.falhas} entrega(s) falharam</small></>}</td>
                  <td className="acoes-linha">
                    <button className="link-botao" onClick={() => verSegredo(w)}>Segredo</button>
                    <button className="link-botao" onClick={() => alternar(w)}>{w.ativo ? 'Pausar' : 'Retomar'}</button>
                    <button className="link-botao perigo" onClick={() => remover(w)}>Remover</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <details className="exemplo-api">
            <summary>Como conferir a assinatura</summary>
            <pre>{`// Node: o corpo CRU da requisição, antes de JSON.parse
const [, t, v1] = req.headers['x-contratos-assinatura'].match(/t=(\\d+),v1=(\\w+)/)
const esperado = crypto.createHmac('sha256', SEGREDO).update(\`\${t}.\${corpoCru}\`).digest('hex')
const valido = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(esperado))`}</pre>
            <p>Responda 2xx em até 10 s. Sem isso, tentamos de novo em 1 min, 5 min, 30 min, 2 h e 6 h. O cabeçalho <code>X-Contratos-Entrega</code> é o mesmo em todas as tentativas: use-o para não processar duas vezes.</p>
          </details>
        </section>
        <form className="cartao" onSubmit={criar}>
          <h2>Novo webhook</h2>
          <Campo rotulo="Endereço (https)"><input type="url" value={novo.url} onChange={e => setNovo(n => ({ ...n, url: e.target.value }))} required placeholder="https://seu-sistema.com.br/contratos/aviso" /></Campo>
          <fieldset className="opcoes-papel">
            <legend>Avisar quando</legend>
            {Object.entries(dados.eventos).map(([ev, rot]) => (
              <label key={ev} className="check"><input type="checkbox" checked={novo.eventos.includes(ev)} onChange={() => marcar(ev)} /><span>{rot} <small><code>{ev}</code></small></span></label>
            ))}
          </fieldset>
          <button className="botao" disabled={acao.ocupado}>Criar webhook</button>
        </form>
      </div>

      <section className="cartao">
        <h2>Últimas entregas</h2>
        {dados.entregas.length === 0 ? <Vazio>Nenhum aviso enviado ainda.</Vazio> : (
          <div className="rolagem">
            <table className="tabela">
              <thead><tr><th>Evento</th><th>Para</th><th>Situação</th><th>Última resposta</th><th></th></tr></thead>
              <tbody>{dados.entregas.map(e => {
                const ultima = e.historico.at(-1)
                return (
                  <tr key={e.id} className={e.status === 'falhou' ? 'linha-problema' : ''}>
                    <td>{dados.eventos[e.evento.tipo] || e.evento.tipo}<br /><small>{dataHora(e.criada_em)}</small></td>
                    <td className="url">{urlDe[e.webhook_id] || '(removido)'}</td>
                    <td>{SITUACAO_ENTREGA[e.status]}{e.tentativas > 1 && <small> ({e.tentativas} tentativas)</small>}{e.status === 'pendente' && e.proxima_em && <><br /><small>próxima {dataHora(e.proxima_em)}</small></>}</td>
                    <td>{ultima ? <small>{ultima.codigo ?? 'sem resposta'}{ultima.resposta ? `: ${ultima.resposta.slice(0, 80)}` : ''}</small> : '—'}</td>
                    <td>{e.status !== 'entregue' && <button className="link-botao" onClick={() => reenviar(e)}>Tentar agora</button>}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
