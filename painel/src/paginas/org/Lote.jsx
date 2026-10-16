import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Erro, PESSOA, Situacao, dataHora, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export function Lote() {
  const { id } = useParams()
  const { podeEscrever, org } = useSessao()
  const { dados: l, erro, carregando, recarregar } = useDados(() => api(`/org/lotes/${id}`), [id, org?.id])
  const acao = useAcao()
  const [aviso, setAviso] = useState(null)

  // Atualiza sozinho enquanto a aba está visível, e na hora em que volta a ficar.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) recarregar() }, 5000)
    const voltou = () => { if (!document.hidden) recarregar() }
    document.addEventListener('visibilitychange', voltou)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', voltou) }
  }, [recarregar])

  if (carregando && !l) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const t = l.totais

  const lembrar = () => acao.executar(async () => {
    const r = await api(`/org/lotes/${l.id}/lembrar`, { metodo: 'POST' })
    setAviso(`${r.lembretes_enviados ? `Novo link enviado para ${plural(r.lembretes_enviados, 'pessoa', 'pessoas')}.` : 'Ninguém para lembrar.'}${r.empresa_lembrada ? ' A empresa também foi lembrada.' : ''} Os links anteriores deixaram de valer.`)
    recarregar()
  })

  return (
    <>
      <Cabecalho titulo={l.nome} sub={`${l.modelo}, a partir de ${l.nome_arquivo}, ${dataHora(l.criado_em)}.${l.assinante ? ` Pela empresa: ${l.assinante.nome}, ${l.assinante.status === 'assinado' ? 'já assinou' : 'ainda não assinou'}.` : ''}`}>
        {podeEscrever && <button className="botao secundario" onClick={lembrar} disabled={acao.ocupado}>Lembrar quem ainda não assinou</button>}
        <button className="botao secundario" onClick={() => acao.executar(() => baixar(`/org/lotes/${l.id}/relatorio.csv`, 'lote.csv'))}>Relatório (Excel)</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}

      <section className="numeros">
        <div className="numero ok"><strong>{t.assinados} de {t.contratos}</strong><span>assinados por todos</span></div>
        <div className="numero"><strong>{t.aguardando}</strong><span>aguardando</span></div>
        {t.recusados > 0 && <div className="numero mal"><strong>{t.recusados}</strong><span>recusados</span></div>}
        {t.expirados > 0 && <div className="numero mal"><strong>{t.expirados}</strong><span>expirados</span></div>}
        {t.nao_geradas > 0 && <div className="numero mal"><strong>{t.nao_geradas}</strong><span>linhas não geradas</span></div>}
      </section>

      <section className="cartao">
        <div className="rolagem">
          <table className="tabela">
            <thead><tr><th>Linha</th>{l.colunas_resumo.map(c => <th key={c}>{c}</th>)}<th>Pessoa</th><th>Empresa</th><th>Situação</th></tr></thead>
            <tbody>{l.linhas.map(x => (
              <tr key={x.numero} className={x.situacao === 'nao_gerado' || x.situacao === 'recusado' ? 'linha-problema' : ''}>
                <td>{x.numero}</td>
                {l.colunas_resumo.map(c => <td key={c}>{x.resumo?.find(r => r.rotulo === c)?.valor}</td>)}
                <td>{(x.pessoas || []).map(p => <div key={p.id}>{PESSOA[p.status] || p.status}{p.recusa_motivo && <small>: "{p.recusa_motivo}"</small>}</div>)}</td>
                <td>{x.empresa ? (x.empresa === 'assinado' ? 'assinou' : 'pendente') : ''}</td>
                <td>
                  {x.contrato_id ? <Link to={`/contratos/${x.contrato_id}`}><Situacao valor={x.situacao} /></Link> : <Situacao valor={x.situacao} />}
                  {x.problemas && <ul className="lista-curta">{x.problemas.map(p => <li key={p}>{p}</li>)}</ul>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  )
}
