// Acompanhamento de um lote: quantos assinaram, quem falta, o que não foi
// gerado e por quê. Atualiza sozinho enquanto a aba está visível.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Erro, PESSOA, Situacao, dataHora, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())
const FILTROS = [
  ['', 'Todas'],
  ['aguardando', 'Aguardando'],
  ['assinado', 'Assinados'],
  ['problema', 'Com problema'],
]
const EM_ASSINATURA = new Set(['enviado', 'parcialmente_assinado'])

export function Lote() {
  const { id } = useParams()
  const { podeEscrever, org } = useSessao()
  const { dados: l, erro, carregando, recarregar } = useDados(() => api(`/org/lotes/${id}`), [id, org?.id])
  const acao = useAcao()
  const [aviso, setAviso] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [atualizadoEm, setAtualizadoEm] = useState(null)

  // Atualiza sozinho enquanto a aba está visível, e na hora em que volta a ficar.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) recarregar() }, 8000)
    const voltou = () => { if (!document.hidden) recarregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', voltou) }
  }, [recarregar])
  useEffect(() => { if (l) setAtualizadoEm(new Date()) }, [l])

  if (carregando && !l) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const t = l.totais
  const pct = t.contratos ? Math.round((t.assinados / t.contratos) * 100) : 0
  const completo = t.contratos > 0 && t.assinados === t.contratos
  const pendentesPessoas = l.linhas.filter(x => EM_ASSINATURA.has(x.situacao) && (x.pessoas || []).some(p => p.status !== 'assinado')).length

  const grupo = (x) => x.situacao === 'assinado' ? 'assinado' : EM_ASSINATURA.has(x.situacao) ? 'aguardando' : 'problema'
  const contagem = Object.fromEntries(FILTROS.map(([v]) => [v, v ? l.linhas.filter(x => grupo(x) === v).length : l.linhas.length]))
  const linhas = l.linhas.filter(x => !filtro || grupo(x) === filtro)

  const lembrar = () => acao.executar(async () => {
    const r = await api(`/org/lotes/${l.id}/lembrar`, { metodo: 'POST' })
    setAviso(`${r.lembretes_enviados ? `Novo link enviado para ${plural(r.lembretes_enviados, 'pessoa', 'pessoas')}.` : 'Ninguém para lembrar.'}${r.empresa_lembrada ? ' A empresa também foi lembrada.' : ''} Os links anteriores deixaram de valer.`)
    recarregar()
  })

  return (
    <>
      <p className="trilha-pagina"><Link to="/lotes">Lotes</Link> <span>/</span> {l.nome}</p>
      <Cabecalho titulo={l.nome} sub={<span className="detalhe-sub">
        <span>{l.modelo}</span>
        <span>de {l.nome_arquivo}</span>
        <span>criado {dataHora(l.criado_em)}</span>
      </span>}>
        {podeEscrever && pendentesPessoas > 0 && <button className="botao" onClick={lembrar} disabled={acao.ocupado}>{acao.ocupado ? 'Enviando…' : `Lembrar ${plural(pendentesPessoas, 'pessoa', 'pessoas')}`}</button>}
        <button className="botao secundario" onClick={() => acao.executar(() => baixar(`/org/lotes/${l.id}/relatorio.csv`, 'lote.csv'))}>Relatório (Excel)</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}

      <section className="cartao lote-andamento">
        <div className="cartao-topo">
          <h2>{completo ? 'Lote concluído' : 'Andamento'}</h2>
          {atualizadoEm && <span className="nota">atualiza sozinho · {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <div className="lote-barra">
          <span><b>{t.assinados}</b> de {t.contratos} contratos assinados por todos</span>
          <div className={`medidor grande${completo ? ' completo' : ''}`}><i style={{ width: `${pct}%` }} /></div>
        </div>
        <ul className="lote-totais">
          <li><b>{t.aguardando}</b> aguardando</li>
          {t.recusados > 0 && <li className="mal"><b>{t.recusados}</b> {t.recusados === 1 ? 'recusado' : 'recusados'}</li>}
          {t.expirados > 0 && <li className="mal"><b>{t.expirados}</b> {t.expirados === 1 ? 'expirado' : 'expirados'}</li>}
          {t.cancelados > 0 && <li><b>{t.cancelados}</b> {t.cancelados === 1 ? 'cancelado' : 'cancelados'}</li>}
          {t.nao_geradas > 0 && <li className="mal"><b>{t.nao_geradas}</b> {t.nao_geradas === 1 ? 'linha não gerada' : 'linhas não geradas'}</li>}
          <li className="lote-empresa-item">
            {l.assinante
              ? <><span className={`status ${l.assinante.status === 'assinado' ? 'assinado' : 'enviado'}`}>{l.assinante.status === 'assinado' ? 'Empresa assinou' : 'Empresa pendente'}</span> <small>{l.assinante.nome}{l.assinante.assinado_em ? `, ${dataHora(l.assinante.assinado_em)}` : ''}</small></>
              : <span className="status encerrado">Sem assinatura da empresa</span>}
          </li>
        </ul>
      </section>

      <div className="chips chips-lote" role="group" aria-label="Filtrar linhas">
        {FILTROS.map(([v, r]) => (v && contagem[v] === 0 && filtro !== v) ? null : (
          <button key={v} type="button" className="chip" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{r}<b>{contagem[v]}</b></button>
        ))}
      </div>

      <section className="cartao cartao-lista">
        <ul className="lista-linhas-m">
          {linhas.map(x => <LinhaCartao key={x.numero} x={x} colunas={l.colunas_resumo} />)}
        </ul>
        <div className="rolagem tabela-desktop">
          <table className="tabela">
            <thead><tr><th>Linha</th>{l.colunas_resumo.map(c => <th key={c}>{cap(c)}</th>)}<th>Pessoa</th><th>Empresa</th><th>Situação</th></tr></thead>
            <tbody>{linhas.map(x => (
              <tr key={x.numero} className={x.situacao === 'nao_gerado' ? 'linha-problema' : ''}>
                <td><small>{x.numero}</small></td>
                {l.colunas_resumo.map(c => <td key={c}>{x.resumo?.find(r => r.rotulo === c)?.valor}</td>)}
                <td>{(x.pessoas || []).map(p => <div key={p.id}><span className={`status ${p.status === 'assinado' ? 'assinado' : p.status === 'recusado' ? 'recusado' : 'enviado'}`}>{cap(PESSOA[p.status] || p.status)}</span>{p.recusa_motivo && <><br /><small className="motivo">"{p.recusa_motivo}"</small></>}</div>)}</td>
                <td>{x.empresa ? <span className={`status ${x.empresa === 'assinado' ? 'assinado' : 'enviado'}`}>{x.empresa === 'assinado' ? 'Assinou' : 'Pendente'}</span> : x.contrato_id ? <small>—</small> : ''}</td>
                <td>
                  {x.contrato_id ? <Link to={`/contratos/${x.contrato_id}`} className="link-situacao"><Situacao valor={x.situacao} /></Link> : <Situacao valor={x.situacao} />}
                  {x.problemas && <ul className="lista-curta problemas">{x.problemas.map(p => <li key={p}>{p}</li>)}</ul>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {linhas.length === 0 && <p className="vazio">Nenhuma linha neste filtro.</p>}
      </section>
    </>
  )
}

function LinhaCartao({ x, colunas }) {
  const nome = x.resumo?.[0]?.valor
  return (
    <li className={x.situacao === 'nao_gerado' ? 'problema' : ''}>
      <div className="linha-m-topo">
        <strong>{x.contrato_id ? <Link to={`/contratos/${x.contrato_id}`}>{nome || `Linha ${x.numero}`}</Link> : (nome || `Linha ${x.numero}`)}</strong>
        <Situacao valor={x.situacao} />
      </div>
      <span className="linha-m-meta">linha {x.numero}{x.resumo?.slice(1).map(r => ` · ${r.valor}`).join('')}</span>
      {(x.pessoas || []).map(p => <span key={p.id} className="linha-m-meta">pessoa: {PESSOA[p.status] || p.status}{p.recusa_motivo ? ` ("${p.recusa_motivo}")` : ''}</span>)}
      {x.empresa && <span className="linha-m-meta">empresa: {x.empresa === 'assinado' ? 'assinou' : 'pendente'}</span>}
      {x.problemas && <ul className="lista-curta problemas">{x.problemas.map(p => <li key={p}>{p}</li>)}</ul>}
    </li>
  )
}
