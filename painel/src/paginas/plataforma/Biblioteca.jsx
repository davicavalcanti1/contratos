// Biblioteca da plataforma: modelos e cláusulas que as organizações usam. O
// developer edita, confere no linter e publica; a organização só vê o publicado.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, Vazio, dataHora, plural, useAcao, useDados } from '../../comum.jsx'

export function Biblioteca() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/plataforma/biblioteca'), [])
  const [aba, setAba] = useState('modelos')
  const [novo, setNovo] = useState(null) // { copiar_de } | {}
  const acao = useAcao()
  const navegar = useNavigate()

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const publicar = (m) => acao.executar(async () => { await api(`/plataforma/biblioteca/modelos/${m.chave}/${m.publicado ? 'despublicar' : 'publicar'}`, { metodo: 'POST' }); recarregar() })
  const publicados = dados.modelos.filter(m => m.publicado).length

  return (
    <>
      <Cabecalho titulo="Biblioteca" sub={`${plural(dados.modelos.length, 'modelo', 'modelos')}, ${publicados} ${publicados === 1 ? 'publicado' : 'publicados'} · ${plural(dados.clausulas.length, 'cláusula', 'cláusulas')}. As organizações só veem o que está publicado.`}>
        {aba === 'modelos' ? <button className="botao" onClick={() => setNovo({})}>Novo modelo</button> : <Link className="botao" to="/plataforma/biblioteca/clausulas/nova">Nova cláusula</Link>}
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />

      <div className="chips chips-lote" role="tablist">
        <button type="button" className="chip" role="tab" aria-pressed={aba === 'modelos'} onClick={() => setAba('modelos')}>Modelos<b>{dados.modelos.length}</b></button>
        <button type="button" className="chip" role="tab" aria-pressed={aba === 'clausulas'} onClick={() => setAba('clausulas')}>Cláusulas<b>{dados.clausulas.length}</b></button>
      </div>

      {novo && <NovoModelo modelos={dados.modelos} inicial={novo} onCancelar={() => setNovo(null)} onCriado={(m) => navegar(`/plataforma/biblioteca/modelos/${m.chave}`)} />}

      {aba === 'modelos' && (
        <section className="cartao cartao-lista">
          {dados.modelos.length === 0 ? <Vazio>Nenhum modelo.</Vazio> : (
            <ul className="lista-modelos">
              {dados.modelos.map(m => (
                <li key={m.chave} className={m.publicado ? '' : 'rascunho'}>
                  <div className="modelo-info">
                    <Link to={`/plataforma/biblioteca/modelos/${m.chave}`}>{m.titulo}</Link>
                    <span><code>{m.chave}</code> · v{m.versao}{m.derivado ? ` · nasce de um contrato assinado${typeof m.derivado === 'object' && m.derivado.tipo ? ` (${m.derivado.tipo})` : ''}` : ''}</span>
                    <span>{plural(m.clausulas, 'cláusula', 'cláusulas')} · {plural(m.variaveis, 'variável', 'variáveis')} · {plural(m.contratos, 'contrato gerado', 'contratos gerados')}</span>
                    {m.descricao && <span className="modelo-desc">{m.descricao}</span>}
                  </div>
                  <div className="modelo-lint">
                    {m.lint.ok
                      ? <span className="status assinado">Linter ok · {m.lint.combinacoes} combinações</span>
                      : <span className="status recusado">{plural(m.lint.graves, 'erro grave', 'erros graves')}</span>}
                    {m.lint.avisos > 0 && <small>{plural(m.lint.avisos, 'aviso', 'avisos')}</small>}
                  </div>
                  <div className="pessoa-estado">
                    <span className={`status ${m.publicado ? 'assinado' : 'gerado'}`}>{m.publicado ? 'Publicado' : 'Rascunho'}</span>
                    <small>{m.publicado ? `desde ${dataHora(m.publicado_em)}` : `alterado ${dataHora(m.atualizado_em)}`}</small>
                    <span className="acoes-linha">
                      <button className="link-botao pequeno-link" disabled={acao.ocupado || (!m.publicado && !m.lint.ok)} onClick={() => publicar(m)}>{m.publicado ? 'Despublicar' : 'Publicar'}</button>
                      <button className="link-botao pequeno-link" onClick={() => setNovo({ copiar_de: m.chave })}>Duplicar</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {aba === 'clausulas' && (
        <section className="cartao cartao-lista">
          <ul className="lista-clausulas">
            {dados.clausulas.map(c => {
              const ultima = c.versoes.at(-1)
              const usadas = new Set(c.versoes.flatMap(v => v.usada_em))
              return (
                <li key={c.chave}>
                  <div className="modelo-info">
                    <Link to={`/plataforma/biblioteca/clausulas/${c.chave}`}>{c.titulo}</Link>
                    <span><code>{c.chave}</code>{c.categoria ? ` · ${c.categoria}` : ''} · {plural(c.versoes.length, 'versão', 'versões')}, atual v{ultima.versao}</span>
                    <span>{usadas.size ? `usada em ${[...usadas].join(', ')}` : 'não usada em nenhum modelo'}</span>
                  </div>
                  <div className="pessoa-estado">
                    {c.critica && <span className="destaque">Em destaque</span>}
                    {c.versoes.some(v => v.versao < ultima.versao && v.usada_em.length) && <small className="erro-texto">modelos ainda na versão antiga</small>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}

function NovoModelo({ modelos, inicial, onCancelar, onCriado }) {
  const origem = modelos.find(m => m.chave === inicial.copiar_de)
  const [f, setF] = useState({ chave: origem ? `${origem.chave}_copia` : '', titulo: origem ? `${origem.titulo} (cópia)` : '' })
  const acao = useAcao()
  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/plataforma/biblioteca/modelos', { metodo: 'POST', corpo: { ...f, copiar_de: inicial.copiar_de } }))
    if (r) onCriado(r)
  }
  return (
    <form className="cartao" onSubmit={criar} noValidate>
      <h2>{origem ? `Duplicar "${origem.titulo}"` : 'Novo modelo'}</h2>
      <p className="nota">{origem ? 'A cópia nasce como rascunho, com as mesmas cláusulas e variáveis. Você edita e publica quando estiver pronta.' : 'Nasce como rascunho com a cláusula "Das partes". Depois você acrescenta variáveis e cláusulas no editor.'}</p>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      <div className="campos">
        <Campo rotulo="Chave" classe="c-4" dica="Identificador técnico, sem espaços: servicos_medicos"><input value={f.chave} onChange={e => setF(x => ({ ...x, chave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} required /></Campo>
        <Campo rotulo="Título" classe="c-8"><input value={f.titulo} onChange={e => setF(x => ({ ...x, titulo: e.target.value }))} required /></Campo>
      </div>
      <div className="acoes"><button className="botao" disabled={acao.ocupado || !f.chave || !f.titulo.trim()}>Criar rascunho</button><button type="button" className="link-botao" onClick={onCancelar}>Cancelar</button></div>
    </form>
  )
}
