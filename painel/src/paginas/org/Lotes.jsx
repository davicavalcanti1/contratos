// Lotes a partir da planilha. A lista mostra o andamento de cada lote; o
// assistente (em /lotes/novo) vai de planilha → colunas → conferência → envio.
// O acompanhamento de um lote fica em Lote.jsx.

import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, Vazio, dataHora, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())

export function Lotes() {
  const { podeEscrever, org } = useSessao()
  const lista = useDados(() => api('/org/lotes'), [org?.id])

  return (
    <>
      <Cabecalho titulo="Lotes" sub="Um contrato por linha da planilha. Cada pessoa assina pelo próprio link, e a empresa assina todos de uma vez.">
        {podeEscrever && <Link className="botao" to="/lotes/novo">Novo lote</Link>}
      </Cabecalho>
      <section className="cartao cartao-lista">
        {lista.carregando && !lista.dados ? <Carregando /> : lista.erro ? <Erro erro={lista.erro} /> : lista.dados.length === 0 ? (
          <Vazio>Nenhum lote ainda.{podeEscrever && <> <Link to="/lotes/novo">Suba a planilha do RH</Link> e gere um contrato por pessoa.</>}</Vazio>
        ) : (
          <ul className="lista-lotes-painel">
            {lista.dados.map(l => {
              const t = l.totais
              const pct = t.contratos ? Math.round((t.assinados / t.contratos) * 100) : 0
              const completo = t.contratos > 0 && t.assinados === t.contratos
              return (
                <li key={l.id}>
                  <div className="lote-texto">
                    <Link to={`/lotes/${l.id}`}>{l.nome}</Link>
                    <span>{l.modelo} · {dataHora(l.criado_em)}</span>
                  </div>
                  <div className="lote-progresso">
                    <span><b>{t.assinados}</b> de {t.contratos} assinados por todos{t.nao_geradas > 0 && <small> · {plural(t.nao_geradas, 'linha não gerada', 'linhas não geradas')}</small>}</span>
                    <div className={`medidor${completo ? ' completo' : ''}`}><i style={{ width: `${pct}%` }} /></div>
                  </div>
                  <div className="lote-empresa">
                    {l.assinante
                      ? <span className={`status ${l.assinante.status === 'assinado' ? 'assinado' : 'enviado'}`}>{l.assinante.status === 'assinado' ? 'Empresa assinou' : 'Empresa pendente'}</span>
                      : <span className="status encerrado">Sem assinatura da empresa</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

const PASSOS = ['Planilha', 'Colunas', 'Conferir e enviar']

export function NovoLote() {
  const { podeEscrever, org } = useSessao()
  const navegar = useNavigate()
  const base = useDados(async () => {
    const [modelos, conta] = await Promise.all([api('/org/modelos'), api('/org/conta')])
    return { modelos, conta }
  }, [org?.id])
  const [passo, setPasso] = useState(0)
  const [modelo, setModelo] = useState('termo_confidencialidade_colaborador')
  const [arquivo, setArquivo] = useState(null)
  const [planilha, setPlanilha] = useState(null)
  const [sugestao, setSugestao] = useState(null)
  const [mapa, setMapa] = useState({})
  const [previa, setPrevia] = useState(null)
  const [nome, setNome] = useState('')
  const [rep, setRep] = useState(null)
  const [prazo, setPrazo] = useState('')
  const [sobre, setSobre] = useState(false)
  const entrada = useRef(null)
  const acao = useAcao()

  if (base.carregando && !base.dados) return <Carregando />
  if (base.erro) return <Erro erro={base.erro} />
  if (!podeEscrever) return <p className="aviso info">Seu acesso é só de leitura.</p>
  const { modelos, conta } = base.dados
  const repAtual = rep ?? { nome: conta.dados?.representante_nome || '', email: '' }
  const modeloAtual = modelos.find(m => m.chave === modelo)

  const lerPlanilha = (e) => {
    e?.preventDefault()
    return acao.executar(async () => {
      if (!arquivo) throw new Error('Escolha a planilha.')
      const p = await api(`/org/lotes/planilha?nome=${encodeURIComponent(arquivo.name)}`, { metodo: 'POST', arquivo })
      const s = await api(`/org/lotes/planilha/${p.planilha_id}/sugestao?modelo=${encodeURIComponent(modelo)}`)
      setPlanilha(p); setSugestao(s); setMapa(s.mapeamento); setPasso(1)
    })
  }
  const conferir = () => acao.executar(async () => {
    setPrevia(await api('/org/lotes/previa', { metodo: 'POST', corpo: { planilha_id: planilha.planilha_id, modelo, mapeamento: mapa } }))
    if (!nome) setNome(`${modeloAtual?.titulo}, ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`)
    setPasso(2)
  })
  const enviar = () => acao.executar(async () => {
    const l = await api('/org/lotes', {
      metodo: 'POST',
      // Só o nome (que vem pré-preenchido do cadastro) não liga a assinatura da empresa: precisa do e-mail.
      corpo: { planilha_id: planilha.planilha_id, modelo, mapeamento: mapa, nome, assinante_organizacao: repAtual.email.trim() ? repAtual : null, prazo_dias: prazo ? Number(prazo) : undefined },
    })
    navegar(`/lotes/${l.id}`)
  })

  const prontas = previa && !previa.cadastro_da_organizacao_incompleto.length ? previa.prontas : 0
  const escolherArquivo = (f) => { if (f) setArquivo(f) }

  return (
    <>
      <p className="trilha-pagina"><Link to="/lotes">Lotes</Link> <span>/</span> Novo lote</p>
      <Cabecalho titulo="Novo lote" sub="Suba a planilha, diga de onde vem cada campo, confira linha a linha e envie." />
      <ol className="etapas etapas-largas">{PASSOS.map((p, i) => <li key={p} aria-current={i === passo ? 'step' : undefined} className={i < passo ? 'feita' : ''}>{p}</li>)}</ol>

      {passo === 0 && (
        <form onSubmit={lerPlanilha} className="duas-colunas largas">
          <section className="cartao">
            <h2>Modelo</h2>
            <div className="modelos-cartoes" role="radiogroup" aria-label="Modelo">
              {modelos.map(m => (
                <button type="button" key={m.chave} role="radio" aria-checked={m.chave === modelo} className="modelo-cartao" onClick={() => setModelo(m.chave)}>
                  <i className="radio" aria-hidden="true" />
                  <span className="modelo-texto"><strong>{m.titulo}</strong><span>{m.descricao}</span></span>
                </button>
              ))}
            </div>
            <h2 className="h2-espaco">Planilha</h2>
            <label className={`soltar soltar-planilha${sobre ? ' sobre' : ''}`} onDragOver={e => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)} onDrop={e => { e.preventDefault(); setSobre(false); escolherArquivo(e.dataTransfer.files[0]) }}>
              <input ref={entrada} type="file" accept=".csv,.xlsx" onChange={e => escolherArquivo(e.target.files[0])} />
              {arquivo
                ? <><strong>{arquivo.name}</strong><span>{(arquivo.size / 1024).toFixed(0)} KB · clique para trocar</span></>
                : <><strong>Escolha ou arraste a planilha aqui</strong><span>.xlsx ou .csv do Excel. Primeira linha com os títulos das colunas, uma pessoa por linha.</span></>}
            </label>
            <p className="nota">Não sabe por onde começar? <button type="button" className="link-botao pequeno-link" disabled={acao.ocupado} onClick={() => acao.executar(() => baixar(`/org/lotes/exemplo.csv?modelo=${encodeURIComponent(modelo)}`, `exemplo-${modelo}.csv`))}>Baixe a planilha de exemplo deste modelo</button>, com uma coluna por campo e uma linha fictícia. Abra no Excel, troque pelos seus dados e suba.</p>
            <Erro erro={acao.erro} onFechar={acao.limparErro} />
            <div className="acoes">
              <button className="botao" disabled={acao.ocupado || !arquivo}>{acao.ocupado ? 'Lendo…' : 'Ler a planilha'}</button>
              <Link className="link-botao" to="/lotes">Cancelar</Link>
            </div>
          </section>
          <aside className="cartao dica-lote">
            <h2>Como funciona</h2>
            <ol className="passos-inicio compacto">
              <li><strong>A planilha vira linhas</strong><span>Cada linha gera um contrato do modelo escolhido. Linhas com dado faltando ou inválido ficam de fora, e você vê o motivo.</span></li>
              <li><strong>As colunas viram campos</strong><span>Dizemos de qual coluna vem cada campo do modelo. Da próxima vez, com as mesmas colunas, o mapeamento já vem pronto.</span></li>
              <li><strong>Cada pessoa recebe o seu link</strong><span>E a empresa assina todos de uma vez, por um link só, lendo o modelo e a tabela com os dados.</span></li>
            </ol>
          </aside>
        </form>
      )}

      {passo === 1 && (
        <section className="cartao">
          <div className="cartao-topo">
            <h2>De onde vem cada campo</h2>
            <span className="nota">{planilha.nome_arquivo} · {plural(planilha.total, 'linha', 'linhas')}</span>
          </div>
          <p className={`aviso ${sugestao.origem === 'salvo' ? 'ok' : 'info'}`}>{sugestao.origem === 'salvo' ? 'Usei o mesmo mapeamento do último lote com estas colunas. Confira e siga.' : 'Sugeri pela semelhança dos nomes das colunas. Confira cada linha antes de seguir.'}</p>
          <Erro erro={acao.erro} onFechar={acao.limparErro} />
          <div className="rolagem">
            <table className="mapa">
              <thead><tr><th>Campo do modelo</th><th>Vem de</th><th>Exemplo (1ª linha)</th></tr></thead>
              <tbody>{sugestao.variaveis.map(v => {
                const m = mapa[v.chave]
                const sel = m?.coluna ? `col:${m.coluna}` : m && 'valor' in m ? 'fixo' : ''
                const padrao = v.padrao !== undefined ? cap(v.opcoes?.find(o => o.valor === v.padrao)?.texto ?? v.padrao) : null
                const set = (val) => setMapa(x => ({ ...x, [v.chave]: val }))
                const obrig = v.obrigatoria !== false && v.padrao === undefined
                return (
                  <tr key={v.chave} className={obrig && !sel ? 'linha-problema' : ''}>
                    <td><strong>{cap(v.rotulo)}</strong>{obrig ? <span className="obrig"> *</span> : <small> · {padrao ? `padrão ${padrao}` : 'opcional'}</small>}</td>
                    <td>
                      <select value={sel} onChange={e => { const s = e.target.value; set(s.startsWith('col:') ? { coluna: s.slice(4) } : s === 'fixo' ? { valor: v.opcoes?.[0]?.valor ?? '' } : null) }}>
                        <option value="">{padrao ? `Não usar (fica ${padrao})` : obrig ? 'Escolha a coluna…' : 'Não usar'}</option>
                        {planilha.colunas.map(c => <option key={c} value={`col:${c}`}>Coluna "{c}"</option>)}
                        <option value="fixo">O mesmo valor para todos…</option>
                      </select>
                      {sel === 'fixo' && (v.tipo === 'enum'
                        ? <select value={m.valor} onChange={e => set({ valor: e.target.value })}>{v.opcoes.map(o => <option key={o.valor} value={o.valor}>{cap(o.texto)}</option>)}</select>
                        : <input value={m.valor} onChange={e => set({ valor: e.target.value })} placeholder="Valor para todas as linhas" />)}
                    </td>
                    <td className="amostra">{m?.coluna ? (planilha.amostra[0]?.valores[m.coluna] || <em>(vazio)</em>) : m && 'valor' in m ? <em>igual para todos</em> : ''}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
          <div className="acoes acoes-passo">
            <button className="botao" onClick={conferir} disabled={acao.ocupado}>{acao.ocupado ? 'Conferindo…' : 'Conferir as linhas'}</button>
            <button className="link-botao" onClick={() => setPasso(0)}>Trocar a planilha</button>
          </div>
        </section>
      )}

      {passo === 2 && (
        <>
          <div className="tres-cartoes">
            <section className="cartao">
              <div className="cartao-topo"><h2>Conferência</h2><span className="nota">{planilha.nome_arquivo}</span></div>
              <div className="numeros compacto">
                <div className="numero ok"><span className="numero-rotulo">Prontas</span><strong>{previa.prontas}</strong><span className="numero-nota">viram contrato</span></div>
                <div className={`numero${previa.com_problema ? ' mal' : ''}`}><span className="numero-rotulo">Com problema</span><strong>{previa.com_problema}</strong><span className="numero-nota">{previa.com_problema ? 'ficam de fora' : 'nenhuma'}</span></div>
              </div>
              {previa.cadastro_da_organizacao_incompleto.length > 0 && <p className="aviso erro">O cadastro da empresa está sem: {previa.cadastro_da_organizacao_incompleto.join(', ')}. Nenhum contrato sai até isso ser preenchido em "Dados da empresa".</p>}
              {previa.com_problema > 0 && <p className="nota">Linhas com problema ficam de fora. Corrija na planilha e suba de novo, ou siga só com as prontas.</p>}
            </section>
            <section className="cartao">
              <h2>Envio</h2>
              <div className="campos">
                <Campo rotulo="Nome do lote" classe="c-12"><input value={nome} onChange={e => setNome(e.target.value)} /></Campo>
                <Campo rotulo="Prazo para assinar (dias)" classe="c-12" dica="Em branco: 30 dias."><input inputMode="numeric" placeholder="30" value={prazo} onChange={e => setPrazo(e.target.value.replace(/D/g, '').slice(0, 3))} /></Campo>
              </div>
            </section>
            <section className="cartao">
              <h2>Quem assina pela empresa</h2>
              <p className="nota">Recebe um link só e assina todos de uma vez. Deixe o e-mail em branco se a empresa não assina.</p>
              <div className="campos">
                <Campo rotulo="Nome completo" classe="c-12"><input value={repAtual.nome} onChange={e => setRep({ ...repAtual, nome: e.target.value })} /></Campo>
                <Campo rotulo="E-mail" classe="c-12" dica={repAtual.email.trim() ? undefined : 'Sem e-mail, a empresa não assina este lote.'}><input type="email" value={repAtual.email} onChange={e => setRep({ ...repAtual, email: e.target.value })} /></Campo>
              </div>
            </section>
          </div>

          <section className="cartao cartao-lista">
            <div className="cartao-topo"><h2>Linha a linha</h2><span className="nota">{plural(previa.total, 'linha', 'linhas')} da planilha</span></div>
            <ul className="lista-linhas-m">
              {previa.linhas.map(l => (
                <li key={l.numero} className={l.ok ? '' : 'problema'}>
                  <div className="linha-m-topo"><strong>{l.resumo[0]?.valor || `Linha ${l.numero}`}</strong>{l.ok ? <span className="status assinado">Pronta</span> : <span className="status recusado">Com problema</span>}</div>
                  <span className="linha-m-meta">linha {l.numero}{l.resumo.slice(1).map(r => ` · ${r.valor}`).join('')}</span>
                  {l.quem_assina.map(q => <span key={q.email} className="linha-m-meta">assina: {q.nome}, {q.email}</span>)}
                  {l.problemas.length > 0 && <ul className="lista-curta problemas">{l.problemas.map(x => <li key={x}>{x}</li>)}</ul>}
                  {l.avisos.length > 0 && <ul className="lista-curta avisos">{l.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
                </li>
              ))}
            </ul>
            <div className="rolagem tabela-desktop">
              <table className="tabela tabela-previa">
                <thead><tr><th>Linha</th>{previa.linhas[0]?.resumo.map(r => <th key={r.rotulo}>{cap(r.rotulo)}</th>)}<th>Quem assina</th><th>Situação</th></tr></thead>
                <tbody>{previa.linhas.map(l => (
                  <tr key={l.numero} className={l.ok ? '' : 'linha-problema'}>
                    <td><small>{l.numero}</small></td>
                    {l.resumo.map(r => <td key={r.rotulo}>{r.valor}</td>)}
                    <td>{l.quem_assina.map(s => <div key={s.email}>{s.nome}<br /><small>{s.email}</small></div>)}</td>
                    <td>
                      {l.problemas.length ? <ul className="lista-curta problemas">{l.problemas.map(p => <li key={p}>{p}</li>)}</ul> : <span className="status assinado">Pronta</span>}
                      {l.avisos.length > 0 && <ul className="lista-curta avisos">{l.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <div className="barra-acao">
            <ul className="resumo-envio-lista horizontal">
              <li className={prontas ? 'ok' : 'pendente'}><b>{prontas ? plural(prontas, 'contrato será gerado', 'contratos serão gerados') : 'Nenhuma linha pronta'}</b><span>{previa.com_problema ? `${plural(previa.com_problema, 'linha fica', 'linhas ficam')} de fora` : 'todas as linhas passaram'}</span></li>
              <li className={repAtual.email.trim() ? 'ok' : 'pendente'}><b>{repAtual.email.trim() ? `${repAtual.nome.split(' ')[0] || 'Empresa'} assina pela empresa` : 'Empresa não assina'}</b><span>{repAtual.email.trim() ? 'um link para todos' : 'só as pessoas assinam'}</span></li>
              <li className="ok"><b>Prazo de {prazo || 30} dias</b><span>o link vai agora</span></li>
            </ul>
            <div className="barra-acao-botoes">
              <button className="link-botao" onClick={() => setPasso(1)}>Ajustar as colunas</button>
              <button className="botao" disabled={!prontas || acao.ocupado} onClick={enviar}>{acao.ocupado ? 'Gerando os contratos…' : prontas ? `Gerar e enviar ${plural(prontas, 'contrato', 'contratos')}` : 'Nenhuma linha pronta'}</button>
            </div>
          </div>
          <Erro erro={acao.erro} onFechar={acao.limparErro} />
        </>
      )}
    </>
  )
}
