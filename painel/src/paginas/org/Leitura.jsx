// Leitura e assinatura: funil de quem recebeu, abriu, confirmou, leu e
// assinou; tempo por cláusula; dúvidas e recusas ligadas a cada cláusula.
// É o que diz onde a bula precisa de outra redação. A mesma tela serve à
// organização e, com a troca de organização, à plataforma.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, dataHora, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const PERIODOS = [[30, '30 dias'], [90, '90 dias'], [365, '12 meses']]
const seg = (s) => (s == null ? '—' : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ''}`.trim())
const pct = (n, de) => (de ? Math.round((n / de) * 100) : 0)
const horas = (h) => (h == null ? '—' : h * 60 < 1 ? '< 1 min' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`)
const minutos = (m) => (m == null ? '—' : m < 1 ? '< 1' : String(Math.round(m)))

export function Leitura({ plataforma = false }) {
  const { org } = useSessao()
  const [dias, setDias] = useState(90)
  const [modelo, setModelo] = useState('')
  const [orgEscolhida, setOrgEscolhida] = useState('')
  const orgs = useDados(() => (plataforma ? api('/plataforma/organizacoes') : Promise.resolve(null)), [plataforma])
  const q = new URLSearchParams({ dias: String(dias), ...(modelo && { modelo }), ...(plataforma && orgEscolhida && { organizacao: orgEscolhida }) })
  const { dados: m, erro, carregando } = useDados(() => api(`${plataforma ? '/plataforma' : '/org'}/metricas?${q}`), [q.toString(), org?.id])

  if (carregando && !m) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const f = m.signatarios
  const c = m.contratos
  const periodo = PERIODOS.find(p => p[0] === dias)[1]
  const etapas = [['Receberam o link', f.receberam], ['Abriram', f.abriram], ['Confirmaram o código', f.confirmaram], ['Leram até o fim', f.leram], ['Assinaram', f.assinaram]]
  const linkContrato = (id) => (plataforma ? null : `/contratos/${id}`)

  return (
    <>
      <Cabecalho titulo="Leitura e assinatura" sub={c.enviados
        ? `${plural(c.enviados, 'contrato enviado', 'contratos enviados')} nos últimos ${periodo}: ${c.assinados} ${c.assinados === 1 ? 'assinado' : 'assinados'}, ${c.recusados} ${c.recusados === 1 ? 'recusado' : 'recusados'}, ${c.expirados} ${c.expirados === 1 ? 'expirado' : 'expirados'}, ${c.em_andamento} em andamento.`
        : `Nenhum contrato enviado nos últimos ${periodo}.`}>
        <div className="chips" role="group" aria-label="Período">
          {PERIODOS.map(([v, r]) => <button key={v} type="button" className="chip" aria-pressed={dias === v} onClick={() => setDias(v)}>{r}</button>)}
        </div>
      </Cabecalho>

      {(plataforma || m.modelos.length > 1) && (
        <div className="filtros-leitura">
          {plataforma && orgs.dados && (
            <label className="campo"><span>Organização</span>
              <select value={orgEscolhida} onChange={e => { setOrgEscolhida(e.target.value); setModelo('') }}>
                <option value="">Todas, sem a demonstração do site</option>
                {orgs.dados.organizacoes.filter(o => o.id !== 'demonstracao').map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                <option value="demonstracao">Clínica Exemplo (demonstração do site)</option>
              </select>
            </label>
          )}
          {m.modelos.length > 1 && (
            <label className="campo"><span>Modelo</span>
              <select value={modelo} onChange={e => setModelo(e.target.value)}>
                <option value="">Todos os modelos</option>
                {m.modelos.map(x => <option key={x.chave} value={x.chave}>{x.titulo} ({x.contratos})</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <section className="numeros" aria-label="Resumo">
        <div className={`numero${f.receberam && pct(f.assinaram, f.receberam) >= 70 ? ' ok' : ''}`}>
          <span className="numero-rotulo">Assinaram</span>
          <strong>{pct(f.assinaram, f.receberam)}<small>%</small></strong>
          <span className="numero-nota">{f.assinaram} de {plural(f.receberam, 'pessoa que recebeu', 'pessoas que receberam')} o link</span>
        </div>
        <div className="numero">
          <span className="numero-rotulo">Do envio à assinatura</span>
          <strong>{horas(c.horas_ate_assinar_mediana)}</strong>
          <span className="numero-nota">mediana por contrato</span>
        </div>
        <div className="numero">
          <span className="numero-rotulo">Lendo, por pessoa</span>
          <strong>{minutos(f.minutos_lendo_mediana)}{f.minutos_lendo_mediana != null && <small> min</small>}</strong>
          <span className="numero-nota">mediana, do código à assinatura</span>
        </div>
        <div className={`numero${m.duvidas.sem_resposta ? ' mal' : ''}`}>
          <span className="numero-rotulo">Dúvidas</span>
          <strong>{m.duvidas.total}</strong>
          <span className="numero-nota">{m.duvidas.total ? (m.duvidas.sem_resposta ? `${m.duvidas.sem_resposta} sem resposta` : 'todas respondidas') : 'nenhuma no período'}</span>
        </div>
        <div className={`numero${f.recusaram ? ' mal' : ''}`}>
          <span className="numero-rotulo">Recusas</span>
          <strong>{f.recusaram}</strong>
          <span className="numero-nota">{f.expiraram ? `e ${f.expiraram} ${f.expiraram === 1 ? 'deixou' : 'deixaram'} expirar` : 'ninguém deixou expirar'}</span>
        </div>
      </section>

      <div className="duas-colunas largas">
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Cláusulas que pedem atenção</h2>
            <span className="nota">ordenadas por dúvidas e recusas, depois por tempo</span>
          </div>
          {m.clausulas.length === 0 ? <Vazio>Ainda não há leitura registrada no período.</Vazio> : (
            <div className="rolagem">
              <table className="tabela tabela-leitura">
                <thead><tr><th>Cláusula</th><th>Leitura</th><th>Ciências</th><th>Dúvidas</th><th>Recusas</th></tr></thead>
                <tbody>
                  {m.clausulas.slice(0, 40).map(x => (
                    <tr key={`${x.modelo}|${x.clausula}`} className={x.duvidas || x.recusas ? 'atencao' : ''}>
                      <td>
                        <strong>{x.titulo}</strong>{x.critica && <span className="etiqueta">em destaque</span>}
                        <br /><small>{x.modelo} · em {plural(x.contratos, 'contrato', 'contratos')}</small>
                      </td>
                      <td title="Mediana do tempo que a cláusula ficou visível na tela, informado pelo navegador">{seg(x.segundos_mediana)}{x.leituras > 0 && <><br /><small>{plural(x.leituras, 'leitura', 'leituras')}</small></>}</td>
                      <td>{x.critica ? x.ciencias : <small>—</small>}</td>
                      <td>{x.duvidas || <small>0</small>}</td>
                      <td>{x.recusas || <small>0</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="nota">O tempo de leitura é informado pelo navegador e serve para comparar cláusulas entre si, não como prova. Cláusula com dúvida ou recusa é onde a bula precisa de outra redação: é trabalho para quem revisa os modelos.</p>
        </section>

        <div className="coluna">
          <section className="cartao">
            <h2>Funil</h2>
            {f.receberam === 0 ? <Vazio>Ninguém recebeu link no período.</Vazio> : (
              <ul className="funil">
                {etapas.map(([r, n]) => (
                  <li key={r}><span>{r}</span><b>{n}<small> · {pct(n, f.receberam)}%</small></b><div className="medidor"><i style={{ width: `${pct(n, f.receberam)}%` }} /></div></li>
                ))}
              </ul>
            )}
            {(f.recusaram || f.expiraram || f.pendentes) ? (
              <p className="nota">{[f.recusaram ? plural(f.recusaram, 'recusou', 'recusaram') : null, f.expiraram ? `${f.expiraram} ${f.expiraram === 1 ? 'deixou' : 'deixaram'} expirar` : null, f.pendentes ? `${f.pendentes} ainda em andamento` : null].filter(Boolean).join(' · ')}</p>
            ) : null}
          </section>

          <section className="cartao">
            <h2>Recusas</h2>
            {m.recusas.length === 0 ? <Vazio>Ninguém recusou no período.</Vazio> : (
              <ul className="lista-recusas">
                {m.recusas.slice(0, 20).map(r => (
                  <li key={`${r.contrato_id}-${r.em}`}>
                    <span className="lista-recusas-meta">
                      {dataHora(r.em)} · {r.signatario} · {linkContrato(r.contrato_id) ? <Link to={linkContrato(r.contrato_id)}>{r.referencia || r.titulo}</Link> : (r.referencia || r.titulo)}
                    </span>
                    <blockquote>{r.motivo}</blockquote>
                    {r.clausula && <small>Cláusula apontada: {r.clausula.numero}, {r.clausula.titulo}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
