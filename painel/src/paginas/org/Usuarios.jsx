import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, dataHora, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export const PAPEIS_ORG = [
  ['org_admin', 'Administrador', 'tudo, inclusive usuários, chaves e webhooks'],
  ['emissor', 'Emissor', 'gera e envia contratos e lotes'],
  ['leitor', 'Leitor', 'só consulta e baixa'],
]

export function Usuarios() {
  const { eu } = useSessao()
  const { dados, erro, carregando, recarregar } = useDados(() => api('/admin/usuarios'), [])
  const acao = useAcao()
  const [novo, setNovo] = useState({ nome: '', email: '', papel: 'emissor' })
  const [aviso, setAviso] = useState(null)

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const convidar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/usuarios', { metodo: 'POST', corpo: novo }))
    if (r) { setAviso(`Convite enviado para ${r.email}. Vale 7 dias.`); setNovo({ nome: '', email: '', papel: 'emissor' }); recarregar() }
  }
  const alterar = (u, patch) => acao.executar(async () => { await api(`/admin/usuarios/${u.id}`, { metodo: 'PATCH', corpo: patch }); recarregar() })

  return (
    <>
      <Cabecalho titulo="Usuários" sub="Quem entra no painel desta empresa." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}
      <div className="duas-colunas largas">
        <section className="cartao">
          <table className="tabela">
            <thead><tr><th>Pessoa</th><th>Papel</th><th>Último acesso</th><th></th></tr></thead>
            <tbody>
              {dados.usuarios.map(u => (
                <tr key={u.id} className={u.ativo ? '' : 'inativo'}>
                  <td>{u.nome}<br /><small>{u.email}</small></td>
                  <td>
                    {u.id === eu.usuario.id ? u.papel_rotulo : (
                      <select aria-label={`Papel de ${u.nome}`} value={u.papel} disabled={!u.ativo} onChange={e => alterar(u, { papel: e.target.value })}>
                        {PAPEIS_ORG.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td>{u.ativo ? dataHora(u.ultimo_acesso_em) : 'desativado'}</td>
                  <td>{u.id !== eu.usuario.id && <button className="link-botao" onClick={() => alterar(u, { ativo: !u.ativo })}>{u.ativo ? 'Desativar' : 'Reativar'}</button>}</td>
                </tr>
              ))}
              {dados.convites.map(c => (
                <tr key={c.email} className="pendente">
                  <td>{c.nome}<br /><small>{c.email}</small></td>
                  <td>{c.papel_rotulo}</td>
                  <td colSpan={2}>convite pendente, vale até {dataHora(c.expira_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <form className="cartao" onSubmit={convidar}>
          <h2>Convidar</h2>
          <Campo rotulo="Nome completo"><input value={novo.nome} onChange={e => setNovo(n => ({ ...n, nome: e.target.value }))} required /></Campo>
          <Campo rotulo="E-mail"><input type="email" value={novo.email} onChange={e => setNovo(n => ({ ...n, email: e.target.value }))} required /></Campo>
          <fieldset className="opcoes-papel">
            <legend>Papel</legend>
            {PAPEIS_ORG.map(([v, r, d]) => (
              <label key={v} className="check"><input type="radio" name="papel" value={v} checked={novo.papel === v} onChange={() => setNovo(n => ({ ...n, papel: v }))} /><span><strong>{r}</strong>: {d}</span></label>
            ))}
          </fieldset>
          <button className="botao" disabled={acao.ocupado}>Enviar convite</button>
        </form>
      </div>
    </>
  )
}
