import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { Campo, Erro, useAcao } from '../comum.jsx'
import { useSessao } from '../sessao.jsx'

// O e-mail da última entrada fica no aparelho (só o e-mail, nunca a senha).
const lembrar = {
  ler() { try { return localStorage.getItem('painel.email') || '' } catch { return '' } },
  gravar(v) { try { v ? localStorage.setItem('painel.email', v) : localStorage.removeItem('painel.email') } catch { /* sem armazenamento: segue sem lembrar */ } },
}

export function Entrar() {
  const { entrar } = useSessao()
  const navegar = useNavigate()
  const local = useLocation()
  const [modo, setModo] = useState('entrar') // entrar | esqueci | enviado
  const [email, setEmail] = useState(lembrar.ler)
  const [senha, setSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [lembrarEmail, setLembrarEmail] = useState(() => !!lembrar.ler())
  const { ocupado, erro, executar, limparErro } = useAcao()

  useEffect(() => { limparErro() }, [modo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e) {
    e.preventDefault()
    const ok = await executar(async () => { await entrar(email, senha); return true })
    if (ok) {
      lembrar.gravar(lembrarEmail ? email.trim().toLowerCase() : '')
      navegar(local.state?.voltar?.replace(/^\/painel/, '') || '/', { replace: true })
    }
  }

  async function pedirLink(e) {
    e.preventDefault()
    const ok = await executar(async () => { await api('/senha/esquecida', { metodo: 'POST', corpo: { email } }); return true })
    if (ok) setModo('enviado')
  }

  return (
    <div className="entrada">
      <aside className="entrada-lado" aria-hidden="true">
        <div className="entrada-lado-marca"><span className="marca-icone" /><span className="marca-nome"><mark>Bulla</mark>Check</span></div>
        <div className="entrada-lado-texto">
          <h2>O contrato que quem assina entende.</h2>
          <p>Modelos com regras, assinatura com bula e ciência registrada, selo com QR em cada página.</p>
        </div>
        <ul className="entrada-lado-lista">
          <li>Resumo simples em cada cláusula</li>
          <li>Dossiê de provas de cada assinatura</li>
          <li>Qualquer pessoa confere o PDF</li>
        </ul>
      </aside>

      <main className="entrada-form">
        <div className="entrada-caixa">
          <div className="marca grande so-estreito"><span className="marca-icone" aria-hidden="true" /><span className="marca-nome"><mark>Bulla</mark>Check</span></div>

          {modo === 'entrar' && (
            <form onSubmit={enviar} noValidate>
              <h1>Entrar no painel</h1>
              <p className="entrada-sub">Use o e-mail e a senha da sua conta.</p>
              <Erro erro={erro} />
              <Campo rotulo="E-mail">
                <input type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus={!email} />
              </Campo>
              <Campo rotulo="Senha">
                <div className="campo-senha">
                  <input type={mostrar ? 'text' : 'password'} name="senha" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required autoFocus={!!email} />
                  <button type="button" className="link-botao" onClick={() => setMostrar(v => !v)} aria-pressed={mostrar}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
                </div>
              </Campo>
              <div className="entrada-linha">
                <label className="check compacto"><input type="checkbox" checked={lembrarEmail} onChange={e => setLembrarEmail(e.target.checked)} /> Lembrar meu e-mail</label>
                <button type="button" className="link-botao" onClick={() => setModo('esqueci')}>Esqueci a senha</button>
              </div>
              <button className="botao largo" disabled={ocupado || !email || !senha}>{ocupado ? 'Entrando…' : 'Entrar'}</button>
              <p className="nota">Não tem acesso? Peça um convite ao administrador da sua empresa.</p>
            </form>
          )}

          {modo === 'esqueci' && (
            <form onSubmit={pedirLink} noValidate>
              <h1>Redefinir a senha</h1>
              <p className="entrada-sub">Digite o e-mail da sua conta. Se ele existir, enviamos um link que vale por uma hora.</p>
              <Erro erro={erro} />
              <Campo rotulo="E-mail">
                <input type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </Campo>
              <button className="botao largo" disabled={ocupado || !email}>{ocupado ? 'Enviando…' : 'Enviar o link'}</button>
              <p className="nota"><button type="button" className="link-botao" onClick={() => setModo('entrar')}>Voltar para entrar</button></p>
            </form>
          )}

          {modo === 'enviado' && (
            <div className="entrada-enviado" role="status">
              <span className="ciente">Pedido recebido</span>
              <h1>Veja o seu e-mail</h1>
              <p className="entrada-sub">Se <strong>{email}</strong> tiver uma conta, o link para criar uma senha nova já está a caminho. Ele vale por uma hora e só funciona uma vez.</p>
              <p className="nota">Não chegou? Confira o lixo eletrônico ou <button type="button" className="link-botao" onClick={() => setModo('esqueci')}>peça de novo</button>.</p>
              <p className="nota"><button type="button" className="link-botao" onClick={() => setModo('entrar')}>Voltar para entrar</button></p>
            </div>
          )}
        </div>
        <p className="entrada-rodape"><Link to="/" reloadDocument>Página inicial</Link> · <a href="/verificar">Conferir um contrato</a></p>
      </main>
    </div>
  )
}
