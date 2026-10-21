import { Link } from 'react-router-dom'
import { Situacao, data, dataHora, plural } from '../../comum.jsx'

const DIA = 864e5
const diasAte = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / DIA)

// O que importa saber da situação, numa linha: prazo para quem aguarda, data
// para quem assinou.
export function notaSituacao(c) {
  if (['enviado', 'parcialmente_assinado'].includes(c.status) && c.expira_em) {
    const d = diasAte(c.expira_em)
    return { texto: d < 0 ? 'prazo vencido' : d === 0 ? 'expira hoje' : `expira em ${plural(d, 'dia', 'dias')}`, urgente: d <= 3 }
  }
  if (c.status === 'assinado' && c.assinado_em) return { texto: `em ${data(c.assinado_em)}` }
  if (c.status === 'gerado') return { texto: 'não enviado' }
  return null
}

// Tabela no desktop, lista de cartões no celular. Usada na visão geral e na
// lista de contratos.
export function ListaContratos({ itens }) {
  return (
    <>
      <ul className="lista-contratos-m">
        {itens.map(c => {
          const total = c.signatarios.length
          const feitas = c.signatarios.filter(s => s.status === 'assinado').length
          const nota = notaSituacao(c)
          return (
            <li key={c.id}>
              <Link to={`/contratos/${c.id}`}>{c.titulo}</Link>
              <span>{c.referencia ? `ref. ${c.referencia} · ` : ''}{total ? c.signatarios.map(s => s.nome).join(', ') : 'ainda não enviado'}</span>
              <div className="lista-contratos-m-rodape">
                <Situacao valor={c.status} />
                {nota && <small className={nota.urgente ? 'urgente' : ''}>{nota.texto}</small>}
                {c.duvidas_abertas > 0 && <small className="urgente">{plural(c.duvidas_abertas, 'dúvida sem resposta', 'dúvidas sem resposta')}</small>}
                {total > 0 && <small>{feitas} de {total} {total === 1 ? 'assinatura' : 'assinaturas'}</small>}
                <small>{dataHora(c.criado_em)}</small>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="rolagem tabela-desktop">
        <table className="tabela">
          <thead><tr><th>Contrato</th><th>Quem assina</th><th>Assinaturas</th><th>Situação</th><th>Criado</th></tr></thead>
          <tbody>
            {itens.map(c => {
              const total = c.signatarios.length
              const feitas = c.signatarios.filter(s => s.status === 'assinado').length
              const nota = notaSituacao(c)
              return (
                <tr key={c.id}>
                  <td><Link to={`/contratos/${c.id}`}>{c.titulo}</Link>{c.referencia && <><br /><small>ref. {c.referencia}</small></>}</td>
                  <td>{total ? c.signatarios.map(s => s.nome).join(', ') : <small>ainda não enviado</small>}</td>
                  <td className="col-assinaturas">
                    {total > 0 && <>
                      <span className="assinaturas-trilho" aria-hidden="true">{c.signatarios.map(s => <i key={s.id} className={s.status === 'assinado' ? 'feito' : s.status === 'recusado' ? 'recusado' : ''} />)}</span>
                      <small>{feitas} de {total}</small>
                    </>}
                  </td>
                  <td><Situacao valor={c.status} />{nota && <><br /><small className={nota.urgente ? 'urgente' : ''}>{nota.texto}</small></>}{c.duvidas_abertas > 0 && <><br /><small className="urgente">{plural(c.duvidas_abertas, 'dúvida sem resposta', 'dúvidas sem resposta')}</small></>}</td>
                  <td><small>{dataHora(c.criado_em)}</small></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
