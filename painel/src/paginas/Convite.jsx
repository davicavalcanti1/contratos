import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Campo, Carregando, Erro, useAcao, useDados } from '../comum.jsx'
import { useSessao } from '../sessao.jsx'

export function Convite() {
  const { token } = useParams()
  const { setEu } = useSessao()
  const navegar = useNavigate()
  const convite = useDados(() => api(`/convite/${encodeURIComponent(token)}`), [token])
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const { ocupado, erro, executar } = useAcao()

  if (convite.carregando) return <Carregando />
  if (convite.erro) return <div className="tela-entrada"><div className="cartao"><h1>Convite indisponível</h1><p>{convite.erro.message}</p></div></div>
  const c = convite.dados

  async function enviar(e) {
    e.preventDefault()
    const eu = await executar(async () => {
      if (senha !== confirma) throw new Error('As duas senhas não são iguais.')
      return api(`/convite/${encodeURIComponent(token)}`, { metodo: 'POST', corpo: { senha } })
    })
    if (eu) { setEu(eu); navegar('/', { replace: true }) }
  }

  return (
    <div className="tela-entrada">
      <form className="cartao" onSubmit={enviar}>
        <div className="marca grande"><span className="marca-icone" aria-hidden="true" /><span className="marca-nome"><mark>Bulla</mark>Check</span></div>
        <h1>Olá, {c.nome.split(' ')[0]}</h1>
        <p>Você entra como <strong>{c.papel.toLowerCase()}</strong>{c.organizacao ? <> de <strong>{c.organizacao}</strong></> : ' da plataforma'}. Crie uma senha para {c.email}.</p>
        <Erro erro={erro} />
        <Campo rotulo="Senha" dica="Pelo menos 10 caracteres. Uma frase curta funciona bem."><input type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={10} autoFocus /></Campo>
        <Campo rotulo="Repita a senha"><input type="password" autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)} required /></Campo>
        <button className="botao largo" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar senha e entrar'}</button>
      </form>
    </div>
  )
}
