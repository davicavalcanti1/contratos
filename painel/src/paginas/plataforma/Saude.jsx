import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, useDados } from '../../comum.jsx'

export function Saude() {
  const { dados: s, erro, carregando } = useDados(() => api('/plataforma/saude'), [])
  if (carregando && !s) return <Carregando />
  if (erro) return <Erro erro={erro} />
  return (
    <>
      <Cabecalho titulo="Saúde da plataforma" sub="O que precisa de atenção agora." />
      <section className="numeros">
        <div className="numero"><strong>{s.organizacoes.total}</strong><span>organizações{s.organizacoes.suspensas ? `, ${s.organizacoes.suspensas} suspensa(s)` : ''}</span></div>
        <div className="numero"><strong>{s.contratos.ultimos_7_dias}</strong><span>contratos gerados em 7 dias</span></div>
        <div className="numero ok"><strong>{s.contratos.assinados_7_dias}</strong><span>assinados em 7 dias</span></div>
        <div className={`numero${s.contratos.parados_7_dias ? ' mal' : ''}`}><strong>{s.contratos.parados_7_dias}</strong><span>parados há mais de 7 dias</span></div>
        <div className={`numero${s.webhooks.com_falha ? ' mal' : ''}`}><strong>{s.webhooks.com_falha}</strong><span>avisos (webhooks) falhando</span></div>
      </section>
      <div className="duas-colunas">
        <section className="cartao">
          <h2>Contratos parados, por organização</h2>
          <p className="nota">Enviados há mais de 7 dias e sem conclusão. Costuma ser e-mail errado ou gente que não abriu o link.</p>
          <Lista itens={s.contratos.parados_por_organizacao} vazio="Nenhum contrato parado." />
        </section>
        <section className="cartao">
          <h2>Webhooks falhando, por organização</h2>
          <p className="nota">O sistema do cliente não respondeu 2xx. Tentamos de novo sozinhos por até 6 h.</p>
          <Lista itens={s.webhooks.por_organizacao} vazio="Todos os avisos estão sendo entregues." />
        </section>
      </div>
    </>
  )
}

function Lista({ itens, vazio }) {
  if (!itens.length) return <Vazio>{vazio}</Vazio>
  return (
    <table className="tabela">
      <tbody>{itens.map(i => <tr key={i.organizacao_id}><td><Link to={`/plataforma/organizacoes/${i.organizacao_id}`}>{i.organizacao}</Link></td><td>{i.n}</td></tr>)}</tbody>
    </table>
  )
}
