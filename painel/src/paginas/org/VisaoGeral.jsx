import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Situacao, Vazio, dataHora, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export function VisaoGeral() {
  const { podeEscrever, ehAdmin, org } = useSessao()
  const { dados, erro, carregando } = useDados(async () => {
    const contar = (status) => api(`/org/contratos?limite=1&status=${status}`).then(r => r.total)
    const [conta, recentes, aguardando, assinados, problemas] = await Promise.all([
      api('/org/conta'),
      api('/org/contratos?limite=8'),
      contar('enviado,parcialmente_assinado'),
      contar('assinado'),
      contar('recusado,expirado'),
    ])
    return { conta, recentes, aguardando, assinados, problemas }
  }, [org?.id])

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const { conta, recentes, aguardando, assinados, problemas } = dados
  const c = conta.consumo
  const pct = c.limite ? Math.min(100, Math.round((c.usados / c.limite) * 100)) : null

  return (
    <>
      <Cabecalho titulo="Visão geral" sub={conta.nome}>
        {podeEscrever && <>
          <Link className="botao" to="/contratos/novo">Novo contrato</Link>
          <Link className="botao secundario" to="/lotes">Lote pela planilha</Link>
        </>}
      </Cabecalho>

      {conta.cadastro_incompleto.length > 0 && (
        <p className="aviso erro">
          O cadastro da empresa está sem: {conta.cadastro_incompleto.join(', ')}. Os contratos usam esses dados e não são gerados sem eles.
          {ehAdmin && <> <Link to="/empresa">Completar o cadastro</Link></>}
        </p>
      )}

      <section className="numeros">
        <div className="numero">
          <strong>{aguardando}</strong>
          <span>aguardando assinatura</span>
          <Link to="/contratos?status=enviado,parcialmente_assinado">Ver</Link>
        </div>
        <div className="numero ok">
          <strong>{assinados}</strong>
          <span>assinados por todos</span>
          <Link to="/contratos?status=assinado">Ver</Link>
        </div>
        <div className={`numero${problemas ? ' mal' : ''}`}>
          <strong>{problemas}</strong>
          <span>recusados ou expirados</span>
          <Link to="/contratos?status=recusado,expirado">Ver</Link>
        </div>
        <div className="numero">
          <strong>{c.limite == null ? c.usados : `${c.usados} de ${c.limite}`}</strong>
          <span>contratos este mês, plano {c.plano}</span>
          {pct != null && <div className="medidor" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do plano"><i style={{ width: `${pct}%` }} className={pct >= 90 ? 'alto' : ''} /></div>}
        </div>
      </section>

      <section className="cartao">
        <h2>Últimos contratos</h2>
        {recentes.itens.length === 0
          ? <Vazio>Nenhum contrato ainda.{podeEscrever && <> <Link to="/contratos/novo">Gere o primeiro</Link> ou envie um <Link to="/lotes">lote pela planilha</Link>.</>}</Vazio>
          : <ListaContratos itens={recentes.itens} />}
      </section>
    </>
  )
}

export function ListaContratos({ itens }) {
  return (
    <div className="rolagem">
      <table className="tabela">
        <thead><tr><th>Contrato</th><th>Quem assina</th><th>Situação</th><th>Criado</th></tr></thead>
        <tbody>
          {itens.map(c => (
            <tr key={c.id}>
              <td><Link to={`/contratos/${c.id}`}>{c.titulo}</Link>{c.referencia && <><br /><small>ref. {c.referencia}</small></>}</td>
              <td>{c.signatarios.length ? c.signatarios.map(s => s.nome).join(', ') : <small>ainda não enviado</small>}<br /><small>assinaturas: {c.signatarios.filter(s => s.status === 'assinado').length} de {c.signatarios.length}</small></td>
              <td><Situacao valor={c.status} /></td>
              <td>{dataHora(c.criado_em)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
