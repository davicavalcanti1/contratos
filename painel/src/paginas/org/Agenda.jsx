// Agenda do contrato vivo: o que vence e o que reajusta, numa linha do tempo
// por data, com o que fazer em cada caso. Os avisos por e-mail saem sozinhos
// (30 e 7 dias antes do fim, 30 dias antes do reajuste); aqui a pessoa vê
// tudo de uma vez e age.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Situacao, Vazio, data, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const moeda = (n) => (n == null ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const quando = (dias) => (dias < 0 ? `há ${plural(-dias, 'dia', 'dias')}` : dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`)
const PERIODOS = [[30, '30 dias'], [90, '90 dias'], [180, '6 meses'], [365, '12 meses']]
const NOME_INDICE = { IPCA: 'IPCA/IBGE', 'IGP-M': 'IGP-M/FGV' }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesDe = (iso) => { const [a, m] = iso.split('-'); return `${MESES[Number(m) - 1]} de ${a}` }

export function Agenda() {
  const { org, podeEscrever } = useSessao()
  const [dias, setDias] = useState(90)
  const [tipo, setTipo] = useState('')
  const { dados: a, erro, carregando } = useDados(() => api(`/org/agenda?dias=${dias}`), [dias, org?.id])

  if (carregando && !a) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const itens = [
    ...a.vencimentos.map(x => ({ ...x, tipo: 'vencimento' })),
    ...a.reajustes.map(x => ({ ...x, tipo: 'reajuste' })),
  ].filter(x => !tipo || x.tipo === tipo).sort((x, y) => x.data.localeCompare(y.data))
  const urgentes = itens.filter(x => x.dias <= 7).length
  const porMes = itens.reduce((m, x) => { const k = x.data.slice(0, 7); (m[k] ||= []).push(x); return m }, {})

  return (
    <>
      <Cabecalho titulo="Agenda" sub={itens.length
        ? `${plural(a.vencimentos.length, 'vencimento', 'vencimentos')} e ${plural(a.reajustes.length, 'reajuste', 'reajustes')} nos próximos ${PERIODOS.find(p => p[0] === dias)[1]}${urgentes ? ` · ${plural(urgentes, 'item', 'itens')} em até 7 dias` : ''}`
        : `Nada vence nem reajusta nos próximos ${PERIODOS.find(p => p[0] === dias)[1]}.`}>
        <div className="chips" role="group" aria-label="Período">
          {PERIODOS.map(([v, r]) => <button key={v} type="button" className="chip" aria-pressed={dias === v} onClick={() => setDias(v)}>{r}</button>)}
        </div>
      </Cabecalho>

      <section className="numeros agenda-numeros" aria-label="Resumo">
        <button type="button" className={`numero${tipo === 'vencimento' ? ' ativo' : ''}${a.vencimentos.some(x => x.dias <= 7) ? ' mal' : ''}`} onClick={() => setTipo(t => t === 'vencimento' ? '' : 'vencimento')} aria-pressed={tipo === 'vencimento'}>
          <span className="numero-rotulo">Vencimentos</span>
          <strong>{a.vencimentos.length}</strong>
          <span className="numero-nota">{a.vencimentos.length ? `o próximo ${quando(a.vencimentos[0].dias)}` : 'nenhum no período'}</span>
        </button>
        <button type="button" className={`numero${tipo === 'reajuste' ? ' ativo' : ''}`} onClick={() => setTipo(t => t === 'reajuste' ? '' : 'reajuste')} aria-pressed={tipo === 'reajuste'}>
          <span className="numero-rotulo">Reajustes</span>
          <strong>{a.reajustes.length}</strong>
          <span className="numero-nota">{a.reajustes.length ? `o próximo ${quando(a.reajustes[0].dias)}` : 'nenhum no período'}</span>
        </button>
        <div className="numero">
          <span className="numero-rotulo">Encerrados</span>
          <strong>{a.encerrados.length}</strong>
          <span className="numero-nota">{a.encerrados.length ? 'recentes, abaixo' : 'nenhum recente'}</span>
        </div>
      </section>

      <div className="duas-colunas largas">
        <section className="cartao cartao-lista">
          <div className="cartao-topo">
            <h2>{tipo === 'vencimento' ? 'Vencimentos' : tipo === 'reajuste' ? 'Reajustes' : 'Linha do tempo'}</h2>
            {tipo && <button type="button" className="link-botao pequeno-link" onClick={() => setTipo('')}>Ver tudo</button>}
          </div>
          {itens.length === 0 ? (
            <Vazio>Nada {tipo === 'vencimento' ? 'vence' : tipo === 'reajuste' ? 'reajusta' : 'vence nem reajusta'} nos próximos {PERIODOS.find(p => p[0] === dias)[1]}. {dias < 365 && <button type="button" className="link-botao pequeno-link" onClick={() => setDias(365)}>Ver 12 meses</button>}</Vazio>
          ) : Object.entries(porMes).map(([mes, lista]) => (
            <div className="agenda-mes" key={mes}>
              <h3>{mesDe(`${mes}-01`)}</h3>
              <ul className="agenda-itens">
                {lista.map(x => (
                  <li key={`${x.tipo}-${x.id}-${x.data}`} className={x.dias <= 7 ? 'urgente' : ''}>
                    <time dateTime={x.data}><b>{x.data.slice(8, 10)}</b><span>{quando(x.dias)}</span></time>
                    <div className="agenda-texto">
                      <span className={`status ${x.tipo === 'vencimento' ? (x.dias <= 7 ? 'recusado' : 'enviado') : 'assinado'}`}>{x.tipo === 'vencimento' ? 'Vence' : 'Reajuste'}</span>
                      <Link to={`/contratos/${x.id}`}>{x.partes || x.titulo}</Link>
                      <small>{x.titulo}{x.referencia ? ` · ref. ${x.referencia}` : ''}{x.tipo === 'reajuste' ? ` · ${NOME_INDICE[x.indice] || x.indice}${x.valor != null ? `, hoje ${moeda(x.valor)}` : ''}` : ''}</small>
                    </div>
                    <div className="agenda-acao">
                      {x.aditivo_pendente
                        ? <small>aditivo em assinatura</small>
                        : podeEscrever && <Link className="botao secundario pequeno" to={`/contratos/${x.id}#mudar`}>{x.tipo === 'vencimento' ? 'Prorrogar' : 'Reajustar'}</Link>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <div className="coluna">
          <section className="cartao">
            <h2>Como os avisos funcionam</h2>
            <ul className="lista-avisos">
              <li><b>30 e 7 dias antes do fim</b> do prazo, quem administra ou emite recebe um e-mail, e o webhook dispara.</li>
              <li><b>30 dias antes de cada reajuste</b>, o mesmo. O painel calcula o novo valor pelo índice oficial do Banco Central.</li>
              <li><b>No dia seguinte ao fim</b>, o contrato é marcado como encerrado sozinho, com evento na trilha.</li>
              <li>Contrato com <b>distrato assinado</b> encerra na data combinada, sem aviso de vencimento.</li>
            </ul>
            <p className="nota">Prorrogar e reajustar geram um termo aditivo, assinado pelas mesmas pessoas. O contrato original nunca é editado.</p>
          </section>

          <section className="cartao">
            <div className="cartao-topo"><h2>Encerrados recentemente</h2></div>
            {a.encerrados.length === 0 ? <Vazio>Nenhum contrato encerrado recentemente.</Vazio> : (
              <ul className="lista-encerrados">
                {a.encerrados.map(e => (
                  <li key={e.id}>
                    <div><Link to={`/contratos/${e.id}`}>{e.partes || e.titulo}</Link><small>{e.titulo}</small></div>
                    <div className="agenda-acao"><Situacao valor={e.status} /><small>{data(e.em)}</small></div>
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
