// Quem entra no painel desta empresa, e com qual papel. Convite por e-mail,
// nunca cadastro aberto.

import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, dataHora, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export const PAPEIS_ORG = [
  ['org_admin', 'Administrador', 'tudo, inclusive usuários, chaves e webhooks'],
  ['emissor', 'Emissor', 'gera e envia contratos e lotes'],
  ['leitor', 'Leitor', 'só consulta e baixa'],
]
const iniciais = (nome) => String(nome).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export function Usuarios() {
  const { eu } = useSessao()
  const { dados, erro, carregando, recarregar } = useDados(() => api('/admin/usuarios'), [])
  const acao = useAcao()
  const [novo, setNovo] = useState({ nome: '', email: '', papel: 'emissor' })
  const [convite, setConvite] = useState(null)
  const [confirmar, setConfirmar] = useState(null) // usuário a desativar

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const convidar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/usuarios', { metodo: 'POST', corpo: novo }))
    if (r) { setConvite(r); setNovo({ nome: '', email: '', papel: 'emissor' }); recarregar() }
  }
  const alterar = (u, patch) => acao.executar(async () => { await api(`/admin/usuarios/${u.id}`, { metodo: 'PATCH', corpo: patch }); setConfirmar(null); recarregar() })
  const ativos = dados.usuarios.filter(u => u.ativo)
  const inativos = dados.usuarios.filter(u => !u.ativo)
  const admins = ativos.filter(u => u.papel === 'org_admin').length

  return (
    <>
      <Cabecalho titulo="Usuários" sub={`${plural(ativos.length, 'pessoa ativa', 'pessoas ativas')}${dados.convites.length ? ` · ${plural(dados.convites.length, 'convite pendente', 'convites pendentes')}` : ''}${inativos.length ? ` · ${plural(inativos.length, 'desativada', 'desativadas')}` : ''}`} />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {convite && (
        <div className="aviso ok chave-nova" role="status">
          <p><strong>Convite enviado para {convite.email}.</strong> Vale 7 dias. Se o e-mail não chegar, mande o link por outro canal:</p>
          <p className="chave-valor"><code>{convite.link}</code> <Copiar texto={convite.link} /></p>
          <button className="link-botao" onClick={() => setConvite(null)}>Fechar</button>
        </div>
      )}
      <div className="duas-colunas largas">
        <div className="coluna">
          <section className="cartao">
            <div className="cartao-topo"><h2>Pessoas</h2></div>
            <ul className="pessoas">
              {ativos.map(u => {
                const souEu = u.id === eu.usuario.id
                const ultimoAdmin = u.papel === 'org_admin' && admins === 1
                return (
                  <li key={u.id} className="pessoa">
                    <span className="avatar" aria-hidden="true">{iniciais(u.nome)}</span>
                    <div className="pessoa-texto">
                      <strong>{u.nome}{souEu && <small> · você</small>}</strong>
                      <span>{u.email}</span>
                      <span>{u.ultimo_acesso_em ? `último acesso ${dataHora(u.ultimo_acesso_em)}` : 'ainda não entrou'}</span>
                    </div>
                    <div className="pessoa-estado">
                      {souEu || ultimoAdmin
                        ? <span className="status enviado" title={ultimoAdmin && !souEu ? 'Único administrador: convide outro antes de mudar.' : undefined}>{u.papel_rotulo}</span>
                        : <select className="select-papel" aria-label={`Papel de ${u.nome}`} value={u.papel} onChange={e => alterar(u, { papel: e.target.value })}>
                            {PAPEIS_ORG.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                          </select>}
                      {!souEu && !ultimoAdmin && (confirmar === u.id
                        ? <span className="confirmar">Desativar {u.nome.split(' ')[0]}? <button className="link-botao perigo" onClick={() => alterar(u, { ativo: false })}>Sim</button> <button className="link-botao" onClick={() => setConfirmar(null)}>Não</button></span>
                        : <button className="link-botao pequeno-link" onClick={() => setConfirmar(u.id)}>Desativar</button>)}
                    </div>
                  </li>
                )
              })}
              {dados.convites.map(c => (
                <li key={c.email} className="pessoa pendente">
                  <span className="avatar" aria-hidden="true">{iniciais(c.nome)}</span>
                  <div className="pessoa-texto">
                    <strong>{c.nome}</strong>
                    <span>{c.email}</span>
                    <span>convite vale até {dataHora(c.expira_em)}</span>
                  </div>
                  <div className="pessoa-estado"><span className="status gerado">Convite pendente</span><small>{c.papel_rotulo}</small></div>
                </li>
              ))}
            </ul>
          </section>
          {inativos.length > 0 && (
            <details className="cartao detalhes-inativos">
              <summary>{plural(inativos.length, 'pessoa desativada', 'pessoas desativadas')}</summary>
              <ul className="pessoas">
                {inativos.map(u => (
                  <li key={u.id} className="pessoa inativo">
                    <span className="avatar" aria-hidden="true">{iniciais(u.nome)}</span>
                    <div className="pessoa-texto"><strong>{u.nome}</strong><span>{u.email} · {u.papel_rotulo}</span></div>
                    <div className="pessoa-estado"><button className="link-botao pequeno-link" onClick={() => alterar(u, { ativo: true })}>Reativar</button></div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <form className="cartao" onSubmit={convidar}>
          <h2>Convidar alguém</h2>
          <p className="nota">A pessoa recebe um link por e-mail, cria a própria senha e entra. O link vale 7 dias.</p>
          <div className="campos">
            <Campo rotulo="Nome completo" classe="c-12"><input value={novo.nome} onChange={e => setNovo(n => ({ ...n, nome: e.target.value }))} required /></Campo>
            <Campo rotulo="E-mail" classe="c-12"><input type="email" value={novo.email} onChange={e => setNovo(n => ({ ...n, email: e.target.value }))} required /></Campo>
          </div>
          <fieldset className="opcoes-papel">
            <legend>Papel</legend>
            {PAPEIS_ORG.map(([v, r, d]) => (
              <label key={v} className={`opcao-cartao${novo.papel === v ? ' marcada' : ''}`}>
                <input type="radio" name="papel" value={v} checked={novo.papel === v} onChange={() => setNovo(n => ({ ...n, papel: v }))} />
                <span><strong>{r}</strong><small>{d}</small></span>
              </label>
            ))}
          </fieldset>
          <button className="botao largo" disabled={acao.ocupado || !novo.nome.trim() || !novo.email.trim()}>{acao.ocupado ? 'Enviando…' : 'Enviar convite'}</button>
        </form>
      </div>
    </>
  )
}
