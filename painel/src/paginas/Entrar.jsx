import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Campo, Erro, useAcao } from '../comum.jsx'
import { useSessao } from '../sessao.jsx'

export function Entrar() {
  const { entrar } = useSessao()
  const navegar = useNavigate()
  const local = useLocation()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const { ocupado, erro, executar } = useAcao()

  async function enviar(e) {
    e.preventDefault()
    const ok = await executar(async () => { await entrar(email, senha); return true })
    if (ok) navegar(local.state?.voltar?.replace(/^\/painel/, '') || '/', { replace: true })
  }

  return (
    <div className="tela-entrada">
      <form className="cartao" onSubmit={enviar}>
        <div className="marca grande"><span className="marca-icone" aria-hidden="true" /><span>Contratos</span></div>
        <h1>Entrar no painel</h1>
        <Erro erro={erro} />
        <Campo rotulo="E-mail"><input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></Campo>
        <Campo rotulo="Senha"><input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required /></Campo>
        <button className="botao largo" disabled={ocupado}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
        <p className="nota">Não tem acesso? Peça um convite ao administrador da sua empresa.</p>
      </form>
    </div>
  )
}
