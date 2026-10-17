// Editor de cláusula: título, parágrafos (cada um com condição opcional),
// resumo em palavras simples, destaque e base legal. Salvar sempre cria uma
// versão nova; os modelos continuam na versão antiga até você aplicar.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, plural, useAcao, useDados } from '../../comum.jsx'

const VAZIA = { chave: '', categoria: '', titulo: '', paragrafos: [{ texto: '' }], resumo_simples: '', critica: false, base_legal: '' }

export function EditorClausula() {
  const { chave } = useParams()
  const nova = chave === 'nova'
  const navegar = useNavigate()
  const base = useDados(async () => {
    const b = await api('/plataforma/biblioteca')
    const c = nova ? null : await api(`/plataforma/biblioteca/clausulas/${chave}`)
    return { c, resumo: b.clausulas.find(x => x.chave === chave) || null, modelos: b.modelos }
  }, [chave])
  const [c, setC] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [aplicar, setAplicar] = useState([])
  const acao = useAcao()

  useEffect(() => {
    if (!base.dados) return
    if (nova) { setC(VAZIA); return }
    const { id, criada_em, origem, versoes, ...resto } = base.dados.c
    setC({ ...resto, paragrafos: resto.paragrafos.map(p => (typeof p === 'string' ? { texto: p } : p)), categoria: resto.categoria || '', resumo_simples: resto.resumo_simples || '', base_legal: resto.base_legal || '' })
  }, [base.dados])

  if (base.carregando && !base.dados) return <Carregando />
  if (base.erro) return <Erro erro={base.erro} />
  if (!c) return <Carregando />

  const set = (k, v) => setC(x => ({ ...x, [k]: v }))
  const setP = (i, patch) => set('paragrafos', c.paragrafos.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const versoes = base.dados.c?.versoes || []
  const atual = base.dados.c?.versao
  // Modelos que usam alguma versão desta cláusula (para oferecer "aplicar a nova").
  const modelosQueUsam = base.dados.resumo ? [...new Set(base.dados.resumo.versoes.flatMap(v => v.usada_em))] : []

  const salvar = () => acao.executar(async () => {
    const corpo = { ...c, paragrafos: c.paragrafos.map(p => (p.quando ? p : p.texto)) }
    const r = await api('/plataforma/biblioteca/clausulas', { metodo: 'POST', corpo })
    if (nova) return navegar(`/plataforma/biblioteca/clausulas/${r.chave}`)
    let msg = `Salva como v${r.versao}. Os modelos continuam na versão anterior até você aplicar.`
    if (aplicar.length) {
      const a = await api(`/plataforma/biblioteca/clausulas/${r.chave}/aplicar`, { metodo: 'POST', corpo: { versao: r.versao, modelos: aplicar } })
      msg += ` Aplicada em ${a.afetados.join(', ') || 'nenhum modelo'}; eles viraram rascunho e precisam ser publicados de novo.`
    }
    setAviso(msg); setAplicar([]); base.recarregar()
  })

  return (
    <>
      <p className="trilha-pagina"><Link to="/plataforma/biblioteca">Biblioteca</Link> <span>/</span> {nova ? 'Nova cláusula' : c.titulo}</p>
      <Cabecalho titulo={nova ? 'Nova cláusula' : c.titulo} sub={!nova && <span className="detalhe-sub"><code>{chave}</code><span>v{atual} de {plural(versoes.length, 'versão', 'versões')}</span>{c.critica && <span className="destaque">Em destaque</span>}{modelosQueUsam.length > 0 && <span>usada em {modelosQueUsam.join(', ')}</span>}</span>}>
        <button className="botao" onClick={salvar} disabled={acao.ocupado}>{acao.ocupado ? 'Salvando…' : nova ? 'Criar cláusula' : 'Salvar como nova versão'}</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok" role="status">{aviso} <button className="link-botao pequeno-link" onClick={() => setAviso(null)}>Fechar</button></p>}

      <div className="duas-colunas largas">
        <section className="cartao formulario">
          <fieldset className="form-secao">
            <legend><h2>Identificação</h2></legend>
            <div className="campos">
              <Campo rotulo="Título" classe="c-6" dica='Como aparece no contrato: "Do foro", "Da confidencialidade".'><input value={c.titulo} onChange={e => set('titulo', e.target.value)} /></Campo>
              <Campo rotulo="Chave" classe="c-3" dica={nova ? 'Sem espaços: sigilo_prontuario' : 'Não muda.'}><input value={c.chave} disabled={!nova} onChange={e => set('chave', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} /></Campo>
              <Campo rotulo="Categoria" classe="c-3" dica="Agrupa na biblioteca: prazo, preco, foro…"><input value={c.categoria} onChange={e => set('categoria', e.target.value)} /></Campo>
              <Campo rotulo="Base legal (opcional)" classe="c-12" dica="Ex.: CC art. 593; CLT art. 442-B. Vai no dossiê."><input value={c.base_legal} onChange={e => set('base_legal', e.target.value)} /></Campo>
            </div>
          </fieldset>

          <fieldset className="form-secao">
            <legend><h2>Texto do contrato</h2><p>Um parágrafo por item, numerados automaticamente (7.1, 7.2…). Use {'{{variavel}}'} para dados e {'{{ref:chave}}'} para citar outra cláusula pelo número. Parágrafo com condição só entra quando ela vale.</p></legend>
            <ol className="lista-paragrafos">
              {c.paragrafos.map((p, i) => (
                <li key={i}>
                  <div className="campos">
                    <Campo rotulo={`Parágrafo ${i + 1}`} classe="c-12"><textarea rows={3} value={p.texto} onChange={e => setP(i, { texto: e.target.value })} /></Campo>
                    <Campo rotulo="Só entra quando (opcional, JSON)" classe="c-12" dica='Ex.: {"campo":"contratado.tipo","op":"in","valor":["pf","mei"]}'>
                      <input value={p.quando ? JSON.stringify(p.quando) : ''} onChange={e => { if (!e.target.value.trim()) return setP(i, { quando: undefined }); try { setP(i, { quando: JSON.parse(e.target.value) }) } catch { /* digitando */ } }} />
                    </Campo>
                  </div>
                  <span className="bloco-acoes">
                    <button type="button" className="link-botao pequeno-link" disabled={i === 0} onClick={() => { const l = [...c.paragrafos]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set('paragrafos', l) }}>↑</button>
                    <button type="button" className="link-botao pequeno-link" disabled={i === c.paragrafos.length - 1} onClick={() => { const l = [...c.paragrafos]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; set('paragrafos', l) }}>↓</button>
                    <button type="button" className="link-botao pequeno-link perigo" disabled={c.paragrafos.length === 1} onClick={() => set('paragrafos', c.paragrafos.filter((_, j) => j !== i))}>Remover</button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="acoes"><button type="button" className="botao secundario pequeno" onClick={() => set('paragrafos', [...c.paragrafos, { texto: '' }])}>Adicionar parágrafo</button></div>
          </fieldset>

          <fieldset className="form-secao">
            <legend><h2>Bula</h2><p>O resumo em palavras simples que a pessoa lê primeiro. Em cláusula em destaque, é o que ela confirma ter entendido.</p></legend>
            <div className="campos">
              <Campo rotulo="Em palavras simples" classe="c-12" dica="Uma ou duas frases, sem juridiquês. Pode usar {{variavel}}."><textarea rows={3} value={c.resumo_simples} onChange={e => set('resumo_simples', e.target.value)} /></Campo>
            </div>
            <label className={`opcao-cartao${c.critica ? ' marcada' : ''}`}>
              <input type="checkbox" checked={c.critica} onChange={e => set('critica', e.target.checked)} />
              <span><strong>Cláusula em destaque</strong><small>Pede ciência individual ("li e entendi") e sai com destaque no PDF. Use em multa, renúncia, exclusividade, foro, limitação de responsabilidade, autonomia (CDC art. 54 §4º).</small></span>
            </label>
          </fieldset>
        </section>

        <div className="coluna">
          <section className="cartao">
            <h2>Como vai aparecer</h2>
            <div className="documento compacto">
              <article className={`clausula${c.critica ? ' critica' : ''}`}>
                <p className="cl-num">Cláusula N{c.critica && <span className="destaque">Em destaque</span>}</p>
                <h3>{c.titulo || 'Título da cláusula'}</h3>
                {c.resumo_simples && <p className="bula"><span className="rotulo">Em palavras simples</span><mark>{c.resumo_simples}</mark></p>}
                <div className="texto-juridico">{c.paragrafos.map((p, i) => <p key={i}><span className="pnum">N.{i + 1}</span>{p.quando && <span className="condicao">condicional </span>}{p.texto || '…'}</p>)}</div>
                {c.critica && <div className="ciencia"><button type="button" className="botao secundario" disabled>Li e entendi esta cláusula</button></div>}
              </article>
            </div>
          </section>

          {!nova && (
            <section className="cartao">
              <h2>Versões e onde é usada</h2>
              <ul className="lista-versoes">
                {base.dados.resumo?.versoes.map(v => (
                  <li key={v.versao} className={v.versao === atual ? 'atual' : ''}>
                    <Link to={`/plataforma/biblioteca/clausulas/${chave}?versao=${v.versao}`}>v{v.versao}</Link>
                    <span>{v.usada_em.length ? `usada em ${v.usada_em.join(', ')}` : 'não usada'}{v.origem === 'semente' ? ' · semente' : ''}</span>
                  </li>
                ))}
              </ul>
              {modelosQueUsam.length > 0 && (
                <div className="aplicar-versao">
                  <h3>Ao salvar a nova versão, aplicar em:</h3>
                  {modelosQueUsam.map(mc => (
                    <label key={mc} className="check compacto-check"><input type="checkbox" checked={aplicar.includes(mc)} onChange={() => setAplicar(a => a.includes(mc) ? a.filter(x => x !== mc) : [...a, mc])} /><span>{base.dados.modelos.find(m => m.chave === mc)?.titulo || mc}<small>vira rascunho; publicar de novo</small></span></label>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  )
}
