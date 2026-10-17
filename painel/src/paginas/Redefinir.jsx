import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Campo, Carregando, Erro, useAcao, useDados } from '../comum.jsx'
import { useSessao } from '../sessao.jsx'

// Link de "esqueci a senha": vale uma hora, uma vez. Ao redefinir, já entra.
export function Redefinir() {
  const { token } = useParams()
  const { setEu } = useSessao()
  const navegar = useNavigate()
  const pedido = useDados(() => api(`/redefinir/${encodeURIComponent(token)}`), [token])
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const { ocupado, erro, executar } = useAcao()

  async function enviar(e) {
    e.preventDefault()
    const eu = await executar(async () => {
      if (senha !== confirma) throw new Error('As duas senhas não são iguais.')
      return api(`/redefinir/${encodeURIComponent(token)}`, { metodo: 'POST', corpo: { senha } })
    })
    if (eu) { setEu(eu); navegar('/', { replace: true }) }
  }

  return (
    <div className="entrada so-form">
      <main className="entrada-form">
        <div className="entrada-caixa">
          <div className="marca grande"><span className="marca-icone" aria-hidden="true" /><span>Contratos</span></div>
          {pedido.carregando && <Carregando />}
          {pedido.erro && (
            <div role="alert">
              <h1>Link indisponível</h1>
              <p className="entrada-sub">{pedido.erro.message}</p>
              <p className="nota"><Link to="/entrar">Voltar para entrar</Link></p>
            </div>
          )}
          {pedido.dados && (
            <form onSubmit={enviar} noValidate>
              <h1>Crie uma senha nova</h1>
              <p className="entrada-sub">Para a conta <strong>{pedido.dados.email}</strong>. As outras sessões abertas serão encerradas.</p>
              <Erro erro={erro} />
              <Campo rotulo="Nova senha" dica="Pelo menos 10 caracteres. Uma frase curta funciona bem.">
                <div className="campo-senha">
                  <input type={mostrar ? 'text' : 'password'} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={10} autoFocus />
                  <button type="button" className="link-botao" onClick={() => setMostrar(v => !v)} aria-pressed={mostrar}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
                </div>
              </Campo>
              <Campo rotulo="Repita a senha">
                <input type={mostrar ? 'text' : 'password'} autoComplete="new-password" value={confirma} onChange={e => setConfirma(e.target.value)} required />
              </Campo>
              <button className="botao largo" disabled={ocupado || senha.length < 10 || !confirma}>{ocupado ? 'Salvando…' : 'Salvar e entrar'}</button>
              <p className="nota"><Link to="/entrar">Voltar para entrar</Link></p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
