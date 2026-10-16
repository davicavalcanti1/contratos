import { useState } from 'react'
import { api } from '../api.js'
import { Cabecalho, Campo, Erro, useAcao } from '../comum.jsx'
import { useSessao } from '../sessao.jsx'

export function Conta() {
  const { eu } = useSessao()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [ok, setOk] = useState(false)
  const { ocupado, erro, executar } = useAcao()

  async function trocar(e) {
    e.preventDefault()
    setOk(false)
    const r = await executar(() => api('/eu/senha', { metodo: 'POST', corpo: { atual, nova } }))
    if (r) { setOk(true); setAtual(''); setNova('') }
  }

  return (
    <>
      <Cabecalho titulo="Minha conta" sub={`${eu.usuario.nome}, ${eu.usuario.email}`} />
      <form className="cartao estreito-esq" onSubmit={trocar}>
        <h2>Trocar a senha</h2>
        <p>Trocar a senha encerra a sua sessão nos outros aparelhos.</p>
        <Erro erro={erro} />
        {ok && <p className="aviso ok">Senha trocada.</p>}
        <Campo rotulo="Senha atual"><input type="password" autoComplete="current-password" value={atual} onChange={e => setAtual(e.target.value)} required /></Campo>
        <Campo rotulo="Nova senha" dica="Pelo menos 10 caracteres."><input type="password" autoComplete="new-password" value={nova} onChange={e => setNova(e.target.value)} required minLength={10} /></Campo>
        <button className="botao" disabled={ocupado}>Trocar a senha</button>
      </form>
    </>
  )
}
