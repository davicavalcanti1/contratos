// Editor de modelo: identificação, variáveis, cláusulas (com condição),
// signatários, vida e lote. Salvar vira rascunho; o linter roda a cada
// salvamento; publicar só com linter ok. Modo JSON para quem prefere.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, Fundamentos, plural, useAcao, useDados } from '../../comum.jsx'

const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())
const ORIGEM_ROTULO = { manual: 'preenchido ao gerar', parte: 'dado da outra parte', parametro: 'parâmetro da empresa', fonte: 'vem da planilha/base', organizacao: 'cadastro da empresa', calculada: 'calculada pelo sistema' }

// Condição como texto JSON, com validação leve na tela (a pesada é do servidor).
function CampoCondicao({ valor, onMudar, rotulo = 'Entra quando (opcional)' }) {
  const [texto, setTexto] = useState(valor ? JSON.stringify(valor) : '')
  const [erro, setErro] = useState(null)
  useEffect(() => { setTexto(valor ? JSON.stringify(valor) : '') }, [valor])
  return (
    <Campo rotulo={rotulo} classe="c-12" dica={erro || 'Ex.: {"campo":"contratado.tipo","op":"eq","valor":"pj"}. Vazio = sempre entra.'}>
      <input className={erro ? 'invalido' : ''} value={texto} onChange={e => {
        setTexto(e.target.value)
        if (!e.target.value.trim()) { setErro(null); onMudar(null); return }
        try { onMudar(JSON.parse(e.target.value)); setErro(null) } catch { setErro('JSON inválido') }
      }} />
    </Campo>
  )
}

export function EditorModelo() {
  const { chave } = useParams()
  const base = useDados(async () => {
    const [m, b] = await Promise.all([api(`/plataforma/biblioteca/modelos/${chave}`), api('/plataforma/biblioteca')])
    return { m, clausulas: b.clausulas, tipos: b.tipos, origens: b.origens }
  }, [chave])
  const [m, setM] = useState(null)
  const [lint, setLint] = useState(null)
  const [modoJson, setModoJson] = useState(false)
  const [json, setJson] = useState('')
  const [jsonErro, setJsonErro] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [dadosPrevia, setDadosPrevia] = useState('{\n  "contratado": { "tipo": "pf" },\n  "contrato": {}\n}')
  const acao = useAcao()

  useEffect(() => {
    if (!base.dados) return
    const { lint: l, id, publicado, publicado_em, atualizado_em, origem, ...resto } = base.dados.m
    setM(resto); setLint(l); setJson(JSON.stringify(resto, null, 2))
  }, [base.dados])

  const sujo = useMemo(() => base.dados && m && JSON.stringify(m) !== JSON.stringify((({ lint, id, publicado, publicado_em, atualizado_em, origem, ...r }) => r)(base.dados.m)), [m, base.dados])

  if (base.carregando && !base.dados) return <Carregando />
  if (base.erro) return <Erro erro={base.erro} />
  if (!m) return <Carregando />
  const publicado = base.dados.m.publicado

  const set = (k, v) => setM(x => ({ ...x, [k]: v }))
  const setVar = (i, patch) => set('variaveis', m.variaveis.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const setBloco = (i, patch) => set('blocos', m.blocos.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const mover = (lista, i, d) => { const l = [...lista]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); return l }
  const grupos = [...new Set(m.variaveis.map(v => v.chave.split('.')[0]))]

  const salvar = () => acao.executar(async () => {
    const corpo = modoJson ? JSON.parse(json) : m
    const r = await api(`/plataforma/biblioteca/modelos/${chave}`, { metodo: 'PUT', corpo })
    setLint(r.lint); setAviso(r.lint.ok ? 'Salvo como rascunho. O linter passou: pode publicar.' : 'Salvo como rascunho. Corrija os erros do linter antes de publicar.')
    base.recarregar()
  })
  const publicar = () => acao.executar(async () => { const r = await api(`/plataforma/biblioteca/modelos/${chave}/publicar`, { metodo: 'POST' }); setLint(r.lint); setAviso(`Publicado como v${r.versao}. As organizações já veem.`); base.recarregar() })
  const despublicar = () => acao.executar(async () => { await api(`/plataforma/biblioteca/modelos/${chave}/despublicar`, { metodo: 'POST' }); setAviso('Despublicado. As organizações não veem mais este modelo; contratos já gerados continuam iguais.'); base.recarregar() })
  const verPrevia = () => acao.executar(async () => {
    let dados; try { dados = JSON.parse(dadosPrevia) } catch { throw new Error('Os dados de exemplo precisam ser JSON válido.') }
    setPrevia(await api(`/plataforma/biblioteca/modelos/${chave}/previa`, { metodo: 'POST', corpo: { modelo: modoJson ? JSON.parse(json) : m, dados } }))
  })
  const aplicarJson = () => { try { const o = JSON.parse(json); setM(o); setJsonErro(null); setModoJson(false) } catch (e) { setJsonErro(e.message) } }

  return (
    <>
      <p className="trilha-pagina"><Link to="/plataforma/biblioteca">Biblioteca</Link> <span>/</span> {m.titulo}</p>
      <Cabecalho titulo={m.titulo} sub={<span className="detalhe-sub">
        <span className={`status ${publicado ? 'assinado' : 'gerado'}`}>{publicado ? `Publicado · v${base.dados.m.versao}` : 'Rascunho'}</span>
        <code>{chave}</code>
        {lint && (lint.ok ? <span className="status assinado">Linter ok · {lint.combinacoes} combinações</span> : <span className="status recusado">{plural(lint.graves.length, 'erro grave', 'erros graves')}</span>)}
        {sujo && <span className="urgente">alterações não salvas</span>}
      </span>}>
        <button className="botao" onClick={salvar} disabled={acao.ocupado || (!sujo && !modoJson)}>{acao.ocupado ? 'Salvando…' : 'Salvar rascunho'}</button>
        {publicado
          ? <button className="botao secundario" onClick={despublicar} disabled={acao.ocupado}>Despublicar</button>
          : <button className="botao secundario" onClick={publicar} disabled={acao.ocupado || sujo || !lint?.ok} title={sujo ? 'Salve antes de publicar' : !lint?.ok ? 'Corrija o linter antes' : ''}>Publicar</button>}
        <button className="link-botao" onClick={() => setModoJson(v => !v)}>{modoJson ? 'Voltar ao formulário' : 'Editar como JSON'}</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok" role="status">{aviso} <button className="link-botao pequeno-link" onClick={() => setAviso(null)}>Fechar</button></p>}

      {lint && !lint.ok && (
        <div className="aviso erro" role="alert">
          <strong>O linter encontrou {plural(lint.graves.length, 'problema grave', 'problemas graves')}:</strong>
          <ul className="lista-curta">{lint.graves.map((g, i) => <li key={i}>{g.onde ? <code>{g.onde}</code> : null} {g.msg}</li>)}</ul>
        </div>
      )}
      {lint?.avisos?.length > 0 && <details className="aviso info detalhes-lint"><summary>{plural(lint.avisos.length, 'aviso do linter', 'avisos do linter')}</summary><ul className="lista-curta">{lint.avisos.map((a, i) => <li key={i}>{a.onde ? <code>{a.onde}</code> : null} {a.msg}</li>)}</ul></details>}

      {modoJson ? (
        <section className="cartao">
          <h2>Modelo em JSON</h2>
          <p className="nota">A forma completa do modelo. "Aplicar" leva para o formulário; "Salvar rascunho" grava direto daqui.</p>
          <textarea className="editor-json" value={json} onChange={e => setJson(e.target.value)} spellCheck={false} />
          {jsonErro && <p className="aviso erro">{jsonErro}</p>}
          <div className="acoes"><button type="button" className="botao secundario" onClick={aplicarJson}>Aplicar ao formulário</button></div>
        </section>
      ) : (
        <div className="duas-colunas largas">
          <div className="coluna">
            <section className="cartao formulario">
              <fieldset className="form-secao">
                <legend><h2>Identificação</h2></legend>
                <div className="campos">
                  <Campo rotulo="Título" classe="c-8"><input value={m.titulo} onChange={e => set('titulo', e.target.value)} /></Campo>
                  <Campo rotulo="Chave" classe="c-4" dica="Não muda depois de criado."><input value={chave} disabled /></Campo>
                  <Campo rotulo="Descrição" classe="c-12" dica="Aparece para a organização ao escolher o modelo."><input value={m.descricao || ''} onChange={e => set('descricao', e.target.value)} /></Campo>
                  <Campo rotulo="Preâmbulo" classe="c-12" dica="Texto de abertura. Pode usar {{variavel}} e {{ref:clausula}}."><textarea rows={2} value={m.preambulo || ''} onChange={e => set('preambulo', e.target.value)} /></Campo>
                  <Campo rotulo="Fecho" classe="c-12"><textarea rows={2} value={m.fecho || ''} onChange={e => set('fecho', e.target.value)} /></Campo>
                </div>
              </fieldset>

              <fieldset className="form-secao">
                <legend><h2>Variáveis</h2><p>Os campos que o modelo pede. O grupo (antes do ponto) vira uma seção do formulário: contratado.nome, contrato.valor.</p></legend>
                {grupos.map(g => (
                  <div className="grupo-vars" key={g}>
                    <h3>{cap(g)}</h3>
                    <ul className="lista-vars">
                      {m.variaveis.map((v, i) => v.chave.startsWith(`${g}.`) && (
                        <li key={i}>
                          <div className="campos">
                            <Campo rotulo="Chave" classe="c-4"><input value={v.chave} onChange={e => setVar(i, { chave: e.target.value })} /></Campo>
                            <Campo rotulo="Rótulo" classe="c-5"><input value={v.rotulo} onChange={e => setVar(i, { rotulo: e.target.value })} /></Campo>
                            <Campo rotulo="Tipo" classe="c-3"><select value={v.tipo} onChange={e => setVar(i, { tipo: e.target.value, ...(e.target.value === 'enum' && !v.opcoes ? { opcoes: [{ valor: 'a', texto: 'A' }] } : {}) })}>{base.dados.tipos.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
                            <Campo rotulo="Origem" classe="c-4"><select value={v.origem || 'manual'} onChange={e => setVar(i, { origem: e.target.value })}>{base.dados.origens.map(o => <option key={o} value={o}>{ORIGEM_ROTULO[o] || o}</option>)}</select></Campo>
                            <Campo rotulo="Padrão (opcional)" classe="c-4"><input value={v.padrao ?? ''} onChange={e => setVar(i, { padrao: e.target.value === '' ? undefined : (v.tipo === 'numero' || v.tipo === 'percentual' ? Number(e.target.value) : e.target.value) })} /></Campo>
                            <Campo rotulo="Obrigatória" classe="c-4"><select value={v.obrigatoria === false ? 'nao' : 'sim'} onChange={e => setVar(i, { obrigatoria: e.target.value === 'sim' ? undefined : false })}><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
                            {v.tipo === 'enum' && <Campo rotulo="Opções (valor = texto, uma por linha)" classe="c-12"><textarea rows={3} value={(v.opcoes || []).map(o => `${o.valor} = ${o.texto}`).join('\n')} onChange={e => setVar(i, { opcoes: e.target.value.split('\n').filter(Boolean).map(l => { const [valor, ...t] = l.split('='); return { valor: valor.trim(), texto: t.join('=').trim() } }) })} /></Campo>}
                          </div>
                          <button type="button" className="link-botao pequeno-link perigo" onClick={() => set('variaveis', m.variaveis.filter((_, j) => j !== i))}>Remover</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <div className="acoes"><button type="button" className="botao secundario pequeno" onClick={() => set('variaveis', [...m.variaveis, { chave: `${grupos[0] || 'contrato'}.nova`, rotulo: 'nova variável', tipo: 'texto', origem: 'manual' }])}>Adicionar variável</button></div>
              </fieldset>

              <fieldset className="form-secao">
                <legend><h2>Cláusulas</h2><p>Na ordem em que entram no contrato. A numeração se acerta sozinha quando uma cláusula não entra.</p></legend>
                <ol className="lista-blocos">
                  {m.blocos.map((b, i) => {
                    const c = base.dados.clausulas.find(x => x.chave === b.clausula)
                    const ultima = c?.versoes.at(-1)?.versao
                    return (
                      <li key={i}>
                        <div className="bloco-topo">
                          <span className="bloco-num">{i + 1}</span>
                          <select value={b.clausula} onChange={e => { const nc = base.dados.clausulas.find(x => x.chave === e.target.value); setBloco(i, { clausula: e.target.value, versao: nc?.versoes.at(-1)?.versao || 1 }) }}>
                            {base.dados.clausulas.map(x => <option key={x.chave} value={x.chave}>{x.titulo} ({x.chave})</option>)}
                          </select>
                          <select className="select-versao" value={b.versao} onChange={e => setBloco(i, { versao: Number(e.target.value) })}>
                            {(c?.versoes || [{ versao: b.versao }]).map(v => <option key={v.versao} value={v.versao}>v{v.versao}</option>)}
                          </select>
                          {c?.critica && <span className="destaque">Em destaque</span>}
                          {ultima && b.versao < ultima && <span className="status gerado" title="Há uma versão mais nova desta cláusula">v{ultima} disponível</span>}
                          <span className="bloco-acoes">
                            <button type="button" className="link-botao pequeno-link" disabled={i === 0} onClick={() => set('blocos', mover(m.blocos, i, -1))}>↑</button>
                            <button type="button" className="link-botao pequeno-link" disabled={i === m.blocos.length - 1} onClick={() => set('blocos', mover(m.blocos, i, 1))}>↓</button>
                            <Link className="link-botao pequeno-link" to={`/plataforma/biblioteca/clausulas/${b.clausula}`}>Abrir</Link>
                            <button type="button" className="link-botao pequeno-link perigo" onClick={() => set('blocos', m.blocos.filter((_, j) => j !== i))}>Remover</button>
                          </span>
                        </div>
                        <div className="campos"><CampoCondicao valor={b.quando} onMudar={q => setBloco(i, { quando: q || undefined })} /></div>
                      </li>
                    )
                  })}
                </ol>
                <div className="acoes"><button type="button" className="botao secundario pequeno" onClick={() => set('blocos', [...m.blocos, { clausula: base.dados.clausulas[0].chave, versao: base.dados.clausulas[0].versoes.at(-1).versao }])}>Adicionar cláusula</button></div>
              </fieldset>

              <fieldset className="form-secao">
                <legend><h2>Quem assina pela outra parte</h2><p>De quais variáveis vêm nome, e-mail e CPF de cada signatário, e quando cada um entra.</p></legend>
                <ul className="lista-vars">
                  {(m.signatarios_da_parte || []).map((s, i) => (
                    <li key={i}>
                      <div className="campos">
                        <Campo rotulo="Papel" classe="c-3"><select value={s.papel || 'parte'} onChange={e => set('signatarios_da_parte', m.signatarios_da_parte.map((x, j) => j === i ? { ...x, papel: e.target.value } : x))}><option value="parte">parte</option><option value="representante">representante</option><option value="testemunha">testemunha</option><option value="interveniente">interveniente</option></select></Campo>
                        {['nome', 'email', 'cpf'].map(k => <Campo key={k} rotulo={`Variável do ${k}`} classe="c-3"><select value={s[k] || ''} onChange={e => set('signatarios_da_parte', m.signatarios_da_parte.map((x, j) => j === i ? { ...x, [k]: e.target.value || undefined } : x))}><option value="">—</option>{m.variaveis.map(v => <option key={v.chave} value={v.chave}>{v.chave}</option>)}</select></Campo>)}
                        <CampoCondicao valor={s.quando} onMudar={q => set('signatarios_da_parte', m.signatarios_da_parte.map((x, j) => j === i ? { ...x, quando: q || undefined } : x))} rotulo="Assina quando (opcional)" />
                      </div>
                      <button type="button" className="link-botao pequeno-link perigo" onClick={() => set('signatarios_da_parte', m.signatarios_da_parte.filter((_, j) => j !== i))}>Remover</button>
                    </li>
                  ))}
                </ul>
                <div className="acoes"><button type="button" className="botao secundario pequeno" onClick={() => set('signatarios_da_parte', [...(m.signatarios_da_parte || []), { papel: 'parte' }])}>Adicionar signatário</button></div>
              </fieldset>

              <fieldset className="form-secao">
                <legend><h2>Lote e contrato vivo</h2><p>Colunas do resumo na assinatura em lote, e como calcular vigência e reajuste (JSON; vazio desliga a agenda para este modelo).</p></legend>
                <div className="campos">
                  <Campo rotulo="Resumo no lote (variáveis, separadas por vírgula)" classe="c-12"><input value={(m.resumo_lote || []).join(', ')} onChange={e => set('resumo_lote', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Campo>
                  <Campo rotulo="Vida (JSON)" classe="c-12" dica='Ex.: {"inicio":"contrato.data_inicio","prazo":{"campo":"contrato.prazo_tipo","determinado":"determinado"},"duracao_meses":"contrato.duracao_meses","valor":"contrato.valor","indice":"contrato.indice_reajuste","reajuste":{"a_cada_meses":12}}'>
                    <textarea rows={4} className="mono" value={m.vida ? JSON.stringify(m.vida, null, 1) : ''} onChange={e => { try { set('vida', e.target.value.trim() ? JSON.parse(e.target.value) : undefined) } catch { /* digitando */ } }} />
                  </Campo>
                </div>
              </fieldset>
            </section>
          </div>

          <div className="coluna">
            <section className="cartao">
              <h2>Prévia</h2>
              <p className="nota">Monte o contrato com dados de exemplo para ver o texto, a bula e o que fica em lacuna. Usa o formulário como está, salvo ou não.</p>
              <Campo rotulo="Dados de exemplo (JSON)" classe="c-12"><textarea rows={6} className="mono" value={dadosPrevia} onChange={e => setDadosPrevia(e.target.value)} spellCheck={false} /></Campo>
              <div className="acoes"><button type="button" className="botao secundario" onClick={verPrevia} disabled={acao.ocupado}>Montar prévia</button></div>
              {previa && (
                <div className="previa-corpo">
                  <p className={`aviso ${previa.pronto ? 'ok' : 'info'}`}>{previa.pronto ? 'Sem lacunas com estes dados.' : `${plural(previa.faltando.length + previa.invalidos.length, 'lacuna', 'lacunas')} com estes dados; marcadas em amarelo.`}</p>
                  <h3 className="previa-titulo">{previa.contrato.titulo}</h3>
                  <div className="documento compacto">
                    {previa.contrato.clausulas.map(c => (
                      <article key={c.chave} className={`clausula${c.critica ? ' critica' : ''}`}>
                        <p className="cl-num">Cláusula {c.numero}{c.critica && <span className="destaque">Em destaque</span>}</p>
                        <h3>{c.titulo}</h3>
                        {c.resumo && <p className="bula"><span className="rotulo">Em palavras simples</span><mark>{marcar(c.resumo, previa.rotulos)}</mark></p>}
                        <div className="texto-juridico">{c.paragrafos.map(p => <p key={p.numero}><span className="pnum">{p.numero}</span>{marcar(p.texto, previa.rotulos)}</p>)}<Fundamentos itens={c.fundamentos} /></div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}

function marcar(texto, rotulos) {
  return String(texto).split(/(\{\{\s*[\w.:|]+\s*\}\})/).map((p, i) => {
    const m = p.match(/^\{\{\s*([\w.:]+)/)
    return m ? <mark key={i} className="lacuna">{rotulos[m[1]] || m[1]}</mark> : p
  })
}
