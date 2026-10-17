// Saúde da plataforma: o que o developer precisa ver de manhã.

import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, plural, useDados } from '../../comum.jsx'

export function Saude() {
  const { dados: s, erro, carregando } = useDados(() => api('/plataforma/saude'), [])
  if (carregando && !s) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const problemas = s.contratos.parados_7_dias + s.webhooks.com_falha + s.organizacoes.suspensas
  return (
    <>
      <Cabecalho titulo="Saúde da plataforma" sub={problemas ? `${plural(problemas, 'ponto pede', 'pontos pedem')} atenção agora.` : 'Tudo em ordem: nada parado, nenhum aviso falhando.'} />

      <section className="numeros" aria-label="Resumo">
        <Link className="numero" to="/plataforma">
          <span className="numero-rotulo">Organizações</span>
          <strong>{s.organizacoes.total}</strong>
          <span className="numero-nota">{s.organizacoes.suspensas ? `${plural(s.organizacoes.suspensas, 'suspensa', 'suspensas')}` : 'todas ativas'}</span>
        </Link>
        <div className="numero">
          <span className="numero-rotulo">Gerados em 7 dias</span>
          <strong>{s.contratos.ultimos_7_dias}</strong>
          <span className="numero-nota">{s.contratos.total} no total</span>
        </div>
        <div className="numero ok">
          <span className="numero-rotulo">Assinados em 7 dias</span>
          <strong>{s.contratos.assinados_7_dias}</strong>
          <span className="numero-nota">por todos, com selo</span>
        </div>
        <div className={`numero${s.contratos.parados_7_dias ? ' mal' : ''}`}>
          <span className="numero-rotulo">Parados há mais de 7 dias</span>
          <strong>{s.contratos.parados_7_dias}</strong>
          <span className="numero-nota">{s.contratos.parados_7_dias ? 'enviados e sem conclusão' : 'nenhum'}</span>
        </div>
        <div className={`numero${s.webhooks.com_falha ? ' mal' : ''}`}>
          <span className="numero-rotulo">Webhooks falhando</span>
          <strong>{s.webhooks.com_falha}</strong>
          <span className="numero-nota">{s.webhooks.com_falha ? 'entregas sem 2xx' : 'tudo entregue'}</span>
        </div>
      </section>

      <div className="duas-colunas">
        <section className="cartao">
          <div className="cartao-topo"><h2>Contratos parados, por organização</h2></div>
          <p className="nota">Enviados há mais de 7 dias e sem conclusão. Costuma ser e-mail errado ou gente que não abriu o link. Abra a organização como suporte para ver quais.</p>
          <Lista itens={s.contratos.parados_por_organizacao} unidade={['contrato', 'contratos']} vazio="Nenhum contrato parado." />
        </section>
        <section className="cartao">
          <div className="cartao-topo"><h2>Webhooks falhando, por organização</h2></div>
          <p className="nota">O sistema do cliente não respondeu 2xx. Tentamos de novo sozinhos por até 6 h; depois disso fica para o administrador deles reenviar.</p>
          <Lista itens={s.webhooks.por_organizacao} unidade={['entrega', 'entregas']} vazio="Todos os avisos estão sendo entregues." />
        </section>
      </div>
    </>
  )
}

function Lista({ itens, unidade, vazio }) {
  if (!itens.length) return <Vazio>{vazio}</Vazio>
  const max = Math.max(...itens.map(i => i.n))
  return (
    <ul className="lista-saude">
      {itens.map(i => (
        <li key={i.organizacao_id}>
          <Link to={`/plataforma/organizacoes/${i.organizacao_id}`}>{i.organizacao}</Link>
          <div className="medidor"><i className="alto" style={{ width: `${Math.round((i.n / max) * 100)}%` }} /></div>
          <span>{plural(i.n, unidade[0], unidade[1])}</span>
        </li>
      ))}
    </ul>
  )
}
