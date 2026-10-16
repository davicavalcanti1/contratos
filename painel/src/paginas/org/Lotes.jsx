// Lote a partir da planilha: planilha → colunas → conferência → envio.
// O acompanhamento de cada lote fica em Lote.jsx.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, Vazio, dataHora, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const PASSOS = ['Planilha', 'Colunas', 'Conferir']

export function Lotes() {
  const { podeEscrever, org } = useSessao()
  const lista = useDados(() => api('/org/lotes'), [org?.id])
  const [novo, setNovo] = useState(false)

  return (
    <>
      <Cabecalho titulo="Lotes" sub="Um contrato por linha da planilha, cada pessoa assina pelo próprio link e a empresa assina todos de uma vez.">
        {podeEscrever && !novo && <button className="botao" onClick={() => setNovo(true)}>Novo lote</button>}
      </Cabecalho>
      {novo && <Assistente onCancelar={() => setNovo(false)} />}
      <section className="cartao">
        <h2>Lotes enviados</h2>
        {lista.carregando && !lista.dados ? <Carregando /> : lista.erro ? <Erro erro={lista.erro} /> : lista.dados.length === 0 ? <Vazio>Nenhum lote ainda.</Vazio> : (
          <table className="tabela">
            <thead><tr><th>Lote</th><th>Modelo</th><th>Assinados por todos</th><th>Empresa</th><th>Criado</th></tr></thead>
            <tbody>{lista.dados.map(l => (
              <tr key={l.id}>
                <td><Link to={`/lotes/${l.id}`}>{l.nome}</Link></td>
                <td>{l.modelo}</td>
                <td>{l.totais.assinados} de {l.totais.contratos}{l.totais.nao_geradas > 0 && <><br /><small>{plural(l.totais.nao_geradas, 'linha não gerada', 'linhas não geradas')}</small></>}</td>
                <td>{l.assinante ? (l.assinante.status === 'assinado' ? 'assinou' : 'pendente') : '—'}</td>
                <td>{dataHora(l.criado_em)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  )
}

function Assistente({ onCancelar }) {
  const navegar = useNavigate()
  const modelos = useDados(() => api('/org/modelos'), [])
  const conta = useDados(() => api('/org/conta'), [])
  const [passo, setPasso] = useState(0)
  const [modelo, setModelo] = useState('termo_confidencialidade_colaborador')
  const [arquivo, setArquivo] = useState(null)
  const [planilha, setPlanilha] = useState(null)
  const [sugestao, setSugestao] = useState(null)
  const [mapa, setMapa] = useState({})
  const [previa, setPrevia] = useState(null)
  const [nome, setNome] = useState('')
  const [rep, setRep] = useState(null)
  const acao = useAcao()

  if (modelos.carregando || conta.carregando) return <Carregando />
  const repAtual = rep ?? { nome: conta.dados?.dados?.representante_nome || '', email: '' }

  const lerPlanilha = (e) => {
    e.preventDefault()
    return acao.executar(async () => {
      if (!arquivo) throw new Error('Escolha a planilha.')
      const p = await api(`/org/lotes/planilha?nome=${encodeURIComponent(arquivo.name)}`, { metodo: 'POST', arquivo })
      const s = await api(`/org/lotes/planilha/${p.planilha_id}/sugestao?modelo=${encodeURIComponent(modelo)}`)
      setPlanilha(p); setSugestao(s); setMapa(s.mapeamento); setPasso(1)
    })
  }
  const conferir = () => acao.executar(async () => {
    setPrevia(await api('/org/lotes/previa', { metodo: 'POST', corpo: { planilha_id: planilha.planilha_id, modelo, mapeamento: mapa } }))
    if (!nome) setNome(`${modelos.dados.find(m => m.chave === modelo)?.titulo}, ${new Date().toLocaleDateString('pt-BR')}`)
    setPasso(2)
  })
  const enviar = () => acao.executar(async () => {
    const l = await api('/org/lotes', {
      metodo: 'POST',
      // Só o nome (que vem pré-preenchido do cadastro) não liga a assinatura da empresa: precisa do e-mail.
      corpo: { planilha_id: planilha.planilha_id, modelo, mapeamento: mapa, nome, assinante_organizacao: repAtual.email.trim() ? repAtual : null },
    })
    navegar(`/lotes/${l.id}`)
  })

  const prontas = previa && !previa.cadastro_da_organizacao_incompleto.length ? previa.prontas : 0

  return (
    <section className="cartao assistente">
      <ol className="etapas">{PASSOS.map((p, i) => <li key={p} aria-current={i === passo ? 'step' : undefined} className={i < passo ? 'feita' : ''}>{p}</li>)}</ol>
      {passo < 2 && <Erro erro={acao.erro} onFechar={acao.limparErro} />}

      {passo === 0 && (
        <form onSubmit={lerPlanilha} className="estreito-esq">
          <Campo rotulo="Modelo" dica={modelos.dados.find(m => m.chave === modelo)?.descricao}>
            <select value={modelo} onChange={e => setModelo(e.target.value)}>{modelos.dados.map(m => <option key={m.chave} value={m.chave}>{m.titulo}</option>)}</select>
          </Campo>
          <Campo rotulo="Planilha (.xlsx ou .csv)" dica="Primeira linha com os títulos das colunas, uma pessoa por linha.">
            <input type="file" accept=".csv,.xlsx" onChange={e => setArquivo(e.target.files[0] || null)} required />
          </Campo>
          <div className="acoes"><button className="botao" disabled={acao.ocupado}>Ler planilha</button><button type="button" className="link-botao" onClick={onCancelar}>Cancelar</button></div>
        </form>
      )}

      {passo === 1 && (
        <>
          <p>{planilha.nome_arquivo}: {plural(planilha.total, 'linha', 'linhas')}. {sugestao.origem === 'salvo' ? 'Usei o mesmo mapeamento do último lote com estas colunas.' : 'Sugeri pela semelhança dos nomes; confira.'}</p>
          <table className="mapa">
            <thead><tr><th>No contrato</th><th>Vem de</th><th>Exemplo da 1ª linha</th></tr></thead>
            <tbody>{sugestao.variaveis.map(v => {
              const m = mapa[v.chave]
              const sel = m?.coluna ? `col:${m.coluna}` : m && 'valor' in m ? 'fixo' : ''
              const padrao = v.padrao !== undefined ? `Não usar (padrão: ${v.opcoes?.find(o => o.valor === v.padrao)?.texto ?? v.padrao})` : 'Não usar'
              const set = (val) => setMapa(x => ({ ...x, [v.chave]: val }))
              return (
                <tr key={v.chave}>
                  <td>{v.rotulo}</td>
                  <td>
                    <select value={sel} onChange={e => { const s = e.target.value; set(s.startsWith('col:') ? { coluna: s.slice(4) } : s === 'fixo' ? { valor: v.opcoes?.[0]?.valor ?? '' } : null) }}>
                      <option value="">{padrao}</option>
                      {planilha.colunas.map(c => <option key={c} value={`col:${c}`}>Coluna "{c}"</option>)}
                      <option value="fixo">O mesmo valor para todos…</option>
                    </select>
                    {sel === 'fixo' && (v.tipo === 'enum'
                      ? <select value={m.valor} onChange={e => set({ valor: e.target.value })}>{v.opcoes.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select>
                      : <input value={m.valor} onChange={e => set({ valor: e.target.value })} placeholder="Valor para todas as linhas" />)}
                  </td>
                  <td className="amostra">{m?.coluna ? (planilha.amostra[0]?.valores[m.coluna] || '(vazio)') : ''}</td>
                </tr>
              )
            })}</tbody>
          </table>
          <div className="acoes"><button className="botao" onClick={conferir} disabled={acao.ocupado}>Conferir as linhas</button><button className="link-botao" onClick={() => setPasso(0)}>Trocar a planilha</button></div>
        </>
      )}

      {passo === 2 && (
        <div className="duas-colunas largas">
          <div>
            <div className="numeros compacto">
              <div className="numero ok"><strong>{previa.prontas}</strong><span>prontas para enviar</span></div>
              <div className={`numero${previa.com_problema ? ' mal' : ''}`}><strong>{previa.com_problema}</strong><span>com problema, ficam de fora</span></div>
            </div>
            {previa.cadastro_da_organizacao_incompleto.length > 0 && <p className="aviso erro">O cadastro da empresa está sem: {previa.cadastro_da_organizacao_incompleto.join(', ')}. Nenhum contrato sai até isso ser preenchido.</p>}
            <div className="rolagem">
              <table className="tabela">
                <thead><tr><th>Linha</th>{previa.linhas[0]?.resumo.map(r => <th key={r.rotulo}>{r.rotulo}</th>)}<th>Assina</th><th>Situação</th></tr></thead>
                <tbody>{previa.linhas.map(l => (
                  <tr key={l.numero} className={l.ok ? '' : 'linha-problema'}>
                    <td>{l.numero}</td>
                    {l.resumo.map(r => <td key={r.rotulo}>{r.valor}</td>)}
                    <td>{l.quem_assina.map(s => <div key={s.email}>{s.nome}<br /><small>{s.email}</small></div>)}</td>
                    <td>
                      {l.problemas.length ? <ul className="lista-curta">{l.problemas.map(p => <li key={p}>{p}</li>)}</ul> : 'pronta'}
                      {l.avisos.length > 0 && <ul className="lista-curta avisos">{l.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div>
            <Campo rotulo="Nome do lote"><input value={nome} onChange={e => setNome(e.target.value)} /></Campo>
            <p><strong>Quem assina pela empresa</strong><br /><small>Recebe um link só e assina todos de uma vez. Deixe em branco se a empresa não assina.</small></p>
            <Campo rotulo="Nome"><input value={repAtual.nome} onChange={e => setRep({ ...repAtual, nome: e.target.value })} /></Campo>
            <Campo rotulo="E-mail" dica={repAtual.email.trim() ? undefined : 'Sem e-mail, a empresa não assina este lote.'}><input type="email" value={repAtual.email} onChange={e => setRep({ ...repAtual, email: e.target.value })} /></Campo>
            <button className="botao largo" disabled={!prontas || acao.ocupado} onClick={enviar}>{acao.ocupado ? 'Gerando os contratos…' : prontas ? `Gerar e enviar ${plural(prontas, 'contrato', 'contratos')}` : 'Nenhuma linha pronta'}</button>
            <Erro erro={acao.erro} onFechar={acao.limparErro} />
            <button className="link-botao" onClick={() => setPasso(1)}>Ajustar as colunas</button>
          </div>
        </div>
      )}
    </section>
  )
}
