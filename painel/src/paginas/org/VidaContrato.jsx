// Contrato vivo no detalhe do contrato: vigência, documentos ligados (aditivo,
// distrato, original) e os formulários de aditivo e distrato.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Campo, Erro, Situacao, data, dataHora, useAcao } from '../../comum.jsx'

const moeda = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const lerValor = (s) => {
  const t = String(s ?? '').replace(/^R\$\s*/i, '').trim()
  const n = /,/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : null
}
const NOME_INDICE = { IPCA: 'IPCA/IBGE', 'IGP-M': 'IGP-M/FGV' }

export function Vigencia({ c }) {
  const v = c.vida
  if (!v) return null
  const fimPerto = v.dias_para_o_fim != null && v.dias_para_o_fim <= 30 && v.dias_para_o_fim >= 0
  return (
    <section className="cartao">
      <h2>Vigência</h2>
      <dl className="dados">
        <dt>Início</dt><dd>{data(v.inicio)}</dd>
        <dt>Término</dt><dd>{v.fim ? <>{data(v.fim)}{c.status === 'assinado' && v.dias_para_o_fim != null && <span className={fimPerto ? ' erro-texto' : ''}>{v.dias_para_o_fim >= 0 ? `, em ${v.dias_para_o_fim} dia(s)` : ''}</span>}</> : 'prazo indeterminado'}</dd>
        {v.aviso_previo_dias != null && v.prazo === 'indeterminado' && <><dt>Aviso prévio</dt><dd>{v.aviso_previo_dias} dias</dd></>}
        {v.valor != null && <><dt>Valor atual</dt><dd>{moeda(v.valor)}</dd></>}
        {v.reajuste && <><dt>Reajuste</dt><dd>a cada {v.reajuste.a_cada_meses} meses pelo {NOME_INDICE[v.indice] || v.indice}{v.proximo_reajuste && <>; próximo em <strong>{data(v.proximo_reajuste)}</strong></>}</dd></>}
      </dl>
      {v.historico?.length > 0 && (
        <>
          <h3>Mudanças por aditivo</h3>
          <ul className="lista-curta">
            {v.historico.map(h => (
              <li key={h.contrato_id}>
                <Link to={`/contratos/${h.contrato_id}`}>{dataHora(h.assinado_em)}</Link>:{' '}
                {h.mudancas.map(m => m.campo === 'fim' ? `término de ${data(m.de)} para ${data(m.para)}` : m.campo === 'valor' ? `valor de ${moeda(m.de)} para ${moeda(m.para)}` : 'objeto alterado').join('; ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function Ligados({ c }) {
  if (!c.origem && !c.derivados?.length) return null
  return (
    <section className="cartao">
      <h2>Documentos ligados</h2>
      {c.origem && <p>{c.origem.tipo === 'aditivo' ? 'Termo aditivo' : 'Distrato'} do <Link to={`/contratos/${c.origem.contrato_id}`}>{c.origem.titulo}</Link> ({c.origem.codigo_verificacao}).</p>}
      {c.derivados?.length > 0 && (
        <table className="tabela">
          <tbody>{c.derivados.map(d => (
            <tr key={d.id}>
              <td><Link to={`/contratos/${d.id}`}>{d.tipo === 'aditivo' ? 'Termo aditivo' : 'Distrato'}</Link><br /><small>gerado {dataHora(d.criado_em)}</small></td>
              <td><Situacao valor={d.status} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  )
}

export function AcoesVida({ c, onGerado }) {
  const [aberto, setAberto] = useState(null) // 'aditivo' | 'distrato'
  const pendente = c.derivados?.some(d => ['gerado', 'enviado', 'parcialmente_assinado'].includes(d.status))
  if (c.status !== 'assinado' || c.origem || c.distrato) return null
  return (
    <section className="cartao">
      <h2>Mudar ou encerrar este contrato</h2>
      {pendente ? <p className="nota">Há um termo deste contrato aguardando assinatura. Conclua ou cancele antes de gerar outro.</p> : (
        <>
          <p className="nota">O contrato assinado não é editado: a mudança vira um documento novo, assinado pelas mesmas pessoas e ligado a este.</p>
          {!aberto && (
            <div className="acoes">
              <button className="botao" onClick={() => setAberto('aditivo')}>Termo aditivo</button>
              <button className="botao secundario" onClick={() => setAberto('distrato')}>Distrato</button>
            </div>
          )}
          {aberto === 'aditivo' && <FormAditivo c={c} onFechar={() => setAberto(null)} onGerado={onGerado} />}
          {aberto === 'distrato' && <FormDistrato c={c} onFechar={() => setAberto(null)} onGerado={onGerado} />}
        </>
      )}
    </section>
  )
}

function FormAditivo({ c, onFechar, onGerado }) {
  const v = c.vida || {}
  const [f, setF] = useState({
    vigencia: v.proximo_reajuste || v.fim || '',
    prorroga: !!v.fim, nova_data_fim: '',
    altera_valor: !!v.reajuste, novo_valor: '', motivo_valor: v.reajuste ? 'reajuste_indice' : 'negociacao', indice_texto: '',
    altera_objeto: false, novo_objeto: '',
  })
  const [calc, setCalc] = useState(null)
  const acao = useAcao()
  const calcAcao = useAcao()
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // Sugestão: mesma duração de antes, emendada no fim atual.
  const sugerirFim = () => {
    if (!v.fim) return
    const meses = Math.round((new Date(v.fim) - new Date(v.inicio)) / (30.44 * 864e5))
    const d = new Date(`${v.fim}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + meses)
    setF(x => ({ ...x, nova_data_fim: d.toISOString().slice(0, 10) }))
  }

  const calcular = () => calcAcao.executar(async () => {
    const para = f.vigencia || v.proximo_reajuste
    if (!para) throw new Error('Informe a data a partir de quando o novo valor vale.')
    const r = await api(`/org/indices/${encodeURIComponent(v.indice || 'IPCA')}?para=${para}`)
    const novo = Math.round(v.valor * (1 + r.acumulado_pct / 100) * 100) / 100
    setCalc(r)
    const mes = (ym) => ym.split('-').reverse().join('/')
    setF(x => ({
      ...x, altera_valor: true, motivo_valor: 'reajuste_indice',
      novo_valor: novo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      indice_texto: `${r.nome} acumulado de ${mes(r.de)} a ${mes(r.ate)}, ${r.acumulado_pct.toLocaleString('pt-BR')}% (${r.fonte})`,
    }))
  })

  const gerar = async (e) => {
    e.preventDefault()
    const campos = { vigencia: f.vigencia }
    if (f.prorroga) Object.assign(campos, { prorroga: true, nova_data_fim: f.nova_data_fim })
    if (f.altera_valor) Object.assign(campos, { altera_valor: true, novo_valor: f.novo_valor, motivo_valor: f.motivo_valor, ...(f.indice_texto ? { indice_texto: f.indice_texto } : {}) })
    if (f.altera_objeto) Object.assign(campos, { altera_objeto: true, novo_objeto: f.novo_objeto })
    const r = await acao.executar(() => api(`/org/contratos/${c.id}/aditivo`, { metodo: 'POST', corpo: { campos } }))
    if (r) onGerado(r)
  }

  const novo = lerValor(f.novo_valor)
  return (
    <form onSubmit={gerar} className="form-vida">
      <h3>Termo aditivo</h3>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      <Campo rotulo="As mudanças valem a partir de" obrigatorio><input type="date" value={f.vigencia} onChange={set('vigencia')} required /></Campo>

      {v.fim && (
        <fieldset className="bloco-mudanca">
          <label className="check"><input type="checkbox" checked={f.prorroga} onChange={set('prorroga')} /><span><strong>Prorrogar o prazo</strong> (termina hoje em {data(v.fim)})</span></label>
          {f.prorroga && (
            <div className="linha-form">
              <Campo rotulo="Nova data de término"><input type="date" value={f.nova_data_fim} min={v.fim} onChange={set('nova_data_fim')} required /></Campo>
              <button type="button" className="botao secundario" onClick={sugerirFim}>Mesma duração de novo</button>
            </div>
          )}
        </fieldset>
      )}

      <fieldset className="bloco-mudanca">
        <label className="check"><input type="checkbox" checked={f.altera_valor} onChange={set('altera_valor')} /><span><strong>Alterar o valor</strong> (hoje {moeda(v.valor)})</span></label>
        {f.altera_valor && (
          <>
            <div className="linha-form">
              <Campo rotulo="Motivo">
                <select value={f.motivo_valor} onChange={set('motivo_valor')}>
                  <option value="reajuste_indice">Reajuste pelo índice do contrato</option>
                  <option value="negociacao">Acordo entre as partes</option>
                </select>
              </Campo>
              {f.motivo_valor === 'reajuste_indice' && v.valor != null && (
                <button type="button" className="botao secundario" onClick={calcular} disabled={calcAcao.ocupado}>{calcAcao.ocupado ? 'Consultando…' : `Calcular pelo ${NOME_INDICE[v.indice] || 'índice'}`}</button>
              )}
            </div>
            <Erro erro={calcAcao.erro} onFechar={calcAcao.limparErro} />
            {calc && (
              <p className="aviso info">
                {calc.nome} acumulado de {calc.de.split('-').reverse().join('/')} a {calc.ate.split('-').reverse().join('/')}: <strong>{calc.acumulado_pct.toLocaleString('pt-BR')}%</strong>.
                {' '}{moeda(v.valor)} × {(1 + calc.acumulado_pct / 100).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} = <strong>{moeda(novo)}</strong>.
                {calc.aviso && <><br />{calc.aviso}</>}<br /><small>Fonte: {calc.fonte}.</small>
              </p>
            )}
            <div className="grade-campos">
              <Campo rotulo="Novo valor" obrigatorio><input inputMode="decimal" value={f.novo_valor} onChange={set('novo_valor')} placeholder="ex.: 2.450,30" required /></Campo>
              {f.motivo_valor === 'reajuste_indice' && <Campo rotulo="Índice e período (vai no texto)" dica="Preenchido pela calculadora; pode ajustar."><input value={f.indice_texto} onChange={set('indice_texto')} /></Campo>}
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="bloco-mudanca">
        <label className="check"><input type="checkbox" checked={f.altera_objeto} onChange={set('altera_objeto')} /><span><strong>Alterar o objeto</strong> (os serviços)</span></label>
        {f.altera_objeto && <Campo rotulo="Nova descrição dos serviços" obrigatorio><textarea value={f.novo_objeto} onChange={set('novo_objeto')} required /></Campo>}
      </fieldset>

      <div className="acoes">
        <button className="botao" disabled={acao.ocupado || !(f.prorroga || f.altera_valor || f.altera_objeto)}>{acao.ocupado ? 'Gerando…' : 'Gerar e enviar o aditivo'}</button>
        <button type="button" className="link-botao" onClick={onFechar}>Cancelar</button>
      </div>
      <p className="nota">Vai para as mesmas pessoas que assinaram o contrato. Prazo e valor deste contrato só mudam quando todos assinarem o aditivo.</p>
    </form>
  )
}

function FormDistrato({ c, onFechar, onGerado }) {
  const [f, setF] = useState({ data_encerramento: '', quitacao: 'total', pendencias: '', dispensa_multa: false })
  const acao = useAcao()
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const gerar = async (e) => {
    e.preventDefault()
    const campos = { data_encerramento: f.data_encerramento, quitacao: f.quitacao, ...(f.quitacao === 'com_pendencias' ? { pendencias: f.pendencias } : {}), ...(f.dispensa_multa ? { dispensa_multa: true } : {}) }
    const r = await acao.executar(() => api(`/org/contratos/${c.id}/distrato`, { metodo: 'POST', corpo: { campos } }))
    if (r) onGerado(r)
  }
  const temMulta = c.vida?.prazo === 'determinado'
  return (
    <form onSubmit={gerar} className="form-vida">
      <h3>Distrato</h3>
      <p className="nota">Encerra o contrato por acordo das duas partes. Sigilo e proteção de dados continuam valendo depois.</p>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      <Campo rotulo="Data de encerramento" obrigatorio><input type="date" value={f.data_encerramento} onChange={set('data_encerramento')} required /></Campo>
      <fieldset className="opcoes-papel">
        <legend>Quitação</legend>
        <label className="check"><input type="radio" name="quitacao" checked={f.quitacao === 'total'} onChange={() => setF(x => ({ ...x, quitacao: 'total' }))} /><span><strong>Total</strong>: acertadas as contas, ninguém cobra mais nada</span></label>
        <label className="check"><input type="radio" name="quitacao" checked={f.quitacao === 'com_pendencias'} onChange={() => setF(x => ({ ...x, quitacao: 'com_pendencias' }))} /><span><strong>Com pendências</strong>: o que ficar listado continua podendo ser cobrado</span></label>
      </fieldset>
      {f.quitacao === 'com_pendencias' && <Campo rotulo="Pendências" obrigatorio><textarea value={f.pendencias} onChange={set('pendencias')} required placeholder="ex.: pagamento da mensalidade de março" /></Campo>}
      {temMulta && <label className="check"><input type="checkbox" checked={f.dispensa_multa} onChange={set('dispensa_multa')} /><span>Dispensar a multa por encerramento antes do prazo</span></label>}
      <div className="acoes">
        <button className="botao perigo" disabled={acao.ocupado}>{acao.ocupado ? 'Gerando…' : 'Gerar e enviar o distrato'}</button>
        <button type="button" className="link-botao" onClick={onFechar}>Cancelar</button>
      </div>
    </form>
  )
}
