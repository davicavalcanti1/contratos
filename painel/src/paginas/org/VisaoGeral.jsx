import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Situacao, Vazio, data, dataHora, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { ListaContratos } from './ListaContratos.jsx'

const DIA = 864e5
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const diasAte = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / DIA)

export function VisaoGeral() {
  const { eu, podeEscrever, ehAdmin, org } = useSessao()
  const { dados, erro, carregando } = useDados(async () => {
    const [conta, recentes, aguardando, problemas, assinados, agenda, lotes] = await Promise.all([
      api('/org/conta'),
      api('/org/contratos?limite=8'),
      api('/org/contratos?limite=50&status=enviado,parcialmente_assinado'),
      api('/org/contratos?limite=5&status=recusado,expirado'),
      api('/org/contratos?limite=1&status=assinado'),
      api('/org/agenda?dias=30'),
      api('/org/lotes').catch(() => []),
    ])
    return { conta, recentes, aguardando, problemas, assinados, agenda, lotes }
  }, [org?.id])

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const { conta, recentes, aguardando, problemas, assinados, agenda, lotes } = dados
  const c = conta.consumo
  const pct = c.limite ? Math.min(100, Math.round((c.usados / c.limite) * 100)) : null
  const primeiroNome = eu.usuario.nome.split(' ')[0]

  // Precisa de atenção: quem está para expirar vem primeiro.
  const pendentes = [...aguardando.itens].sort((a, b) => String(a.expira_em || '').localeCompare(String(b.expira_em || '')))
  const expirando = pendentes.filter(x => x.expira_em && diasAte(x.expira_em) <= 3)
  const proximos = [
    ...agenda.vencimentos.map(x => ({ ...x, tipo: 'vencimento' })),
    ...agenda.reajustes.map(x => ({ ...x, tipo: 'reajuste' })),
  ].sort((a, b) => a.data.localeCompare(b.data)).slice(0, 6)
  const lotesAbertos = lotes.filter(l => l.totais && l.totais.assinados < l.totais.contratos).slice(0, 3)
  const vazio = recentes.total === 0

  return (
    <>
      <Cabecalho titulo={`${saudacao()}, ${primeiroNome}`} sub={vazio ? 'Vamos gerar o primeiro contrato?' : resumoDoDia({ aguardando: aguardando.total, expirando: expirando.length, problemas: problemas.total })}>
        {podeEscrever && <>
          <Link className="botao" to="/contratos/novo">Novo contrato</Link>
          <Link className="botao secundario" to="/lotes">Lote pela planilha</Link>
        </>}
      </Cabecalho>

      {conta.cadastro_incompleto.length > 0 && (
        <div className="aviso erro" role="alert">
          <strong>Cadastro da empresa incompleto.</strong> Falta: {conta.cadastro_incompleto.join(', ')}. Os contratos usam esses dados e não são gerados sem eles.
          {ehAdmin && <> <Link to="/empresa">Completar agora</Link></>}
        </div>
      )}
      {pct != null && pct >= 80 && (
        <div className="aviso info" role="status">
          Você usou <strong>{c.usados} de {c.limite}</strong> contratos do plano {c.plano} este mês{c.restantes === 0 ? ': o limite acabou' : `, restam ${c.restantes}`}.
        </div>
      )}

      <section className="numeros" aria-label="Resumo">
        <Link className="numero" to="/contratos?status=enviado,parcialmente_assinado">
          <span className="numero-rotulo">Aguardando assinatura</span>
          <strong>{aguardando.total}</strong>
          <span className="numero-nota">{expirando.length ? `${plural(expirando.length, 'expira', 'expiram')} em até 3 dias` : aguardando.total ? 'nenhum expira nos próximos 3 dias' : 'nada pendente'}</span>
        </Link>
        <Link className="numero ok" to="/contratos?status=assinado">
          <span className="numero-rotulo">Assinados por todos</span>
          <strong>{assinados.total}</strong>
          <span className="numero-nota">{assinados.total ? 'com selo e dossiê prontos' : 'o primeiro ainda não chegou'}</span>
        </Link>
        <Link className={`numero${problemas.total ? ' mal' : ''}`} to="/contratos?status=recusado,expirado">
          <span className="numero-rotulo">Recusados ou expirados</span>
          <strong>{problemas.total}</strong>
          <span className="numero-nota">{problemas.total ? 'veja o motivo e reenvie se for o caso' : 'nenhum problema'}</span>
        </Link>
        <div className="numero">
          <span className="numero-rotulo">Gerados este mês</span>
          <strong>{c.limite == null ? c.usados : <>{c.usados}<small> / {c.limite}</small></>}</strong>
          <span className="numero-nota">plano {c.plano}{c.limite == null ? ', sem limite' : ''}</span>
          {pct != null && <div className="medidor" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do plano"><i style={{ width: `${pct}%` }} className={pct >= 90 ? 'alto' : ''} /></div>}
        </div>
      </section>

      {vazio ? (
        <section className="cartao primeiros-passos">
          <h2>Comece por aqui</h2>
          <ol className="passos-inicio">
            <li>
              <strong>Confira os dados da empresa</strong>
              <span>Razão social, CNPJ, endereço e quem assina pela empresa entram em todos os contratos.</span>
              {ehAdmin && <Link to="/empresa">Dados da empresa</Link>}
            </li>
            <li>
              <strong>Gere um contrato de teste</strong>
              <span>Escolha um modelo, preencha e mande para o seu próprio e-mail. Você vê a bula como o signatário vê.</span>
              {podeEscrever && <Link to="/contratos/novo">Novo contrato</Link>}
            </li>
            <li>
              <strong>Depois, em lote</strong>
              <span>Suba a planilha do RH, confira a prévia e gere um contrato por pessoa.</span>
              {podeEscrever && <Link to="/lotes">Lote pela planilha</Link>}
            </li>
          </ol>
        </section>
      ) : (
        <div className="duas-colunas largas">
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Precisa de atenção</h2>
              <Link to="/contratos?status=enviado,parcialmente_assinado">Ver todos</Link>
            </div>
            {pendentes.length === 0 && problemas.itens.length === 0
              ? <Vazio>Nada pendente. Todos os contratos enviados foram assinados.</Vazio>
              : (
                <ul className="lista-atencao">
                  {pendentes.slice(0, 5).map(x => <ItemPendente key={x.id} c={x} />)}
                  {problemas.itens.slice(0, 3).map(x => (
                    <li key={x.id}>
                      <Link to={`/contratos/${x.id}`} className="lista-atencao-titulo">{x.titulo}</Link>
                      <span className="lista-atencao-meta">{x.signatarios.map(s => s.nome).join(', ')}</span>
                      <Situacao valor={x.status} />
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <div className="coluna">
            <section className="cartao">
              <div className="cartao-topo">
                <h2>Próximos 30 dias</h2>
                <Link to="/agenda">Agenda</Link>
              </div>
              {proximos.length === 0
                ? <Vazio>Nenhum vencimento nem reajuste até {data(new Date(Date.now() + 30 * DIA).toISOString().slice(0, 10))}.</Vazio>
                : (
                  <ul className="lista-agenda">
                    {proximos.map(x => (
                      <li key={`${x.tipo}-${x.id}-${x.data}`}>
                        <time dateTime={x.data}>{data(x.data)}</time>
                        <div>
                          <Link to={`/contratos/${x.id}`}>{x.titulo}</Link>
                          <span>{x.tipo === 'vencimento' ? `vence em ${plural(x.dias, 'dia', 'dias')}` : `reajuste pelo ${x.indice}`}{x.partes?.length ? ` · ${x.partes.join(', ')}` : ''}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            {lotesAbertos.length > 0 && (
              <section className="cartao">
                <div className="cartao-topo">
                  <h2>Lotes em andamento</h2>
                  <Link to="/lotes">Todos os lotes</Link>
                </div>
                <ul className="lista-lotes">
                  {lotesAbertos.map(l => (
                    <li key={l.id}>
                      <Link to={`/lotes/${l.id}`}>{l.nome}</Link>
                      <span>{l.totais.assinados} de {l.totais.contratos} assinados</span>
                      <div className="medidor"><i style={{ width: `${Math.round((l.totais.assinados / l.totais.contratos) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {!vazio && (
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Últimos contratos</h2>
            <Link to="/contratos">Todos os contratos</Link>
          </div>
          <ListaContratos itens={recentes.itens} />
        </section>
      )}
    </>
  )
}

function resumoDoDia({ aguardando, expirando, problemas }) {
  const partes = []
  if (aguardando) partes.push(`${plural(aguardando, 'contrato aguarda', 'contratos aguardam')} assinatura`)
  if (expirando) partes.push(`${expirando} ${expirando === 1 ? 'expira' : 'expiram'} em até 3 dias`)
  if (problemas) partes.push(`${plural(problemas, 'precisa', 'precisam')} de uma decisão sua`)
  return partes.length ? partes.join(' · ') : 'Tudo em dia por aqui.'
}

function ItemPendente({ c }) {
  const dias = c.expira_em ? diasAte(c.expira_em) : null
  const assinaram = c.signatarios.filter(s => s.status === 'assinado').length
  const faltam = c.signatarios.filter(s => s.status !== 'assinado').map(s => s.nome.split(' ')[0])
  return (
    <li className={dias != null && dias <= 3 ? 'urgente' : ''}>
      <Link to={`/contratos/${c.id}`} className="lista-atencao-titulo">{c.titulo}{c.referencia && <small> · {c.referencia}</small>}</Link>
      <span className="lista-atencao-meta">
        {assinaram} de {c.signatarios.length} {c.signatarios.length === 1 ? 'assinatura' : 'assinaturas'}
        {faltam.length > 0 && <> · falta {faltam.join(', ')}</>}
      </span>
      <span className={`prazo${dias != null && dias <= 3 ? ' urgente' : ''}`}>
        {dias == null ? '' : dias < 0 ? 'expirado' : dias === 0 ? 'expira hoje' : `expira em ${plural(dias, 'dia', 'dias')}`}
      </span>
    </li>
  )
}
