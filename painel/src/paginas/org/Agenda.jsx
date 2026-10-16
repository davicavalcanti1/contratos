import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Situacao, Vazio, data, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const moeda = (n) => (n == null ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const quando = (dias) => (dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`)

export function Agenda() {
  const { org } = useSessao()
  const [dias, setDias] = useState(90)
  const { dados: a, erro, carregando } = useDados(() => api(`/org/agenda?dias=${dias}`), [dias, org?.id])

  if (carregando && !a) return <Carregando />
  if (erro) return <Erro erro={erro} />

  return (
    <>
      <Cabecalho titulo="Agenda" sub="O que vence e o que reajusta. Avisamos por e-mail 30 e 7 dias antes do fim, e 30 dias antes de cada reajuste.">
        <label className="campo compacto"><span className="sr">Período</span>
          <select value={dias} onChange={e => setDias(Number(e.target.value))}>
            <option value={30}>Próximos 30 dias</option>
            <option value={90}>Próximos 90 dias</option>
            <option value={180}>Próximos 6 meses</option>
            <option value={365}>Próximos 12 meses</option>
          </select>
        </label>
      </Cabecalho>

      <div className="duas-colunas">
        <section className="cartao">
          <h2>Vencimentos</h2>
          {a.vencimentos.length === 0 ? <Vazio>Nenhum contrato vence neste período.</Vazio> : (
            <table className="tabela">
              <thead><tr><th>Contrato</th><th>Termina</th><th></th></tr></thead>
              <tbody>{a.vencimentos.map(v => (
                <tr key={v.id} className={v.dias <= 7 ? 'linha-problema' : ''}>
                  <td><Link to={`/contratos/${v.id}`}>{v.partes || v.titulo}</Link><br /><small>{v.titulo}{v.referencia ? `, ref. ${v.referencia}` : ''}</small></td>
                  <td>{data(v.data)}<br /><small>{quando(v.dias)}</small></td>
                  <td>{v.aditivo_pendente ? <small>aditivo em assinatura</small> : <Link to={`/contratos/${v.id}#mudar`}>Prorrogar</Link>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section className="cartao">
          <h2>Reajustes</h2>
          {a.reajustes.length === 0 ? <Vazio>Nenhum reajuste neste período.</Vazio> : (
            <table className="tabela">
              <thead><tr><th>Contrato</th><th>Reajusta</th><th>Valor atual</th><th></th></tr></thead>
              <tbody>{a.reajustes.map(r => (
                <tr key={r.id}>
                  <td><Link to={`/contratos/${r.id}`}>{r.partes || r.titulo}</Link><br /><small>{r.titulo}{r.referencia ? `, ref. ${r.referencia}` : ''}</small></td>
                  <td>{data(r.data)}<br /><small>{quando(r.dias)}, {r.indice}</small></td>
                  <td>{moeda(r.valor)}</td>
                  <td>{r.aditivo_pendente ? <small>aditivo em assinatura</small> : <Link to={`/contratos/${r.id}#mudar`}>Reajustar</Link>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <section className="cartao">
        <h2>Encerrados recentemente</h2>
        {a.encerrados.length === 0 ? <Vazio>Nenhum.</Vazio> : (
          <table className="tabela">
            <tbody>{a.encerrados.map(e => (
              <tr key={e.id}>
                <td><Link to={`/contratos/${e.id}`}>{e.partes || e.titulo}</Link><br /><small>{e.titulo}</small></td>
                <td><Situacao valor={e.status} /></td>
                <td>{data(e.em)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  )
}
