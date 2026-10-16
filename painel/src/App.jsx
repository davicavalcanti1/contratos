import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Carregando } from './comum.jsx'
import { useSessao } from './sessao.jsx'
import { Convite } from './paginas/Convite.jsx'
import { Entrar } from './paginas/Entrar.jsx'
import { Conta } from './paginas/Conta.jsx'
import { Chaves } from './paginas/org/Chaves.jsx'
import { Contrato } from './paginas/org/Contrato.jsx'
import { Contratos } from './paginas/org/Contratos.jsx'
import { Empresa } from './paginas/org/Empresa.jsx'
import { Lote } from './paginas/org/Lote.jsx'
import { Lotes } from './paginas/org/Lotes.jsx'
import { NovoContrato } from './paginas/org/NovoContrato.jsx'
import { Usuarios } from './paginas/org/Usuarios.jsx'
import { VisaoGeral } from './paginas/org/VisaoGeral.jsx'
import { Webhooks } from './paginas/org/Webhooks.jsx'
import { Auditoria } from './paginas/plataforma/Auditoria.jsx'
import { Organizacao } from './paginas/plataforma/Organizacao.jsx'
import { Organizacoes } from './paginas/plataforma/Organizacoes.jsx'
import { Saude } from './paginas/plataforma/Saude.jsx'

export function App() {
  const { eu } = useSessao()
  if (eu === undefined) return <Carregando />
  return (
    <Routes>
      <Route path="/convite/:token" element={<Convite />} />
      <Route path="/entrar" element={eu ? <Navigate to="/" replace /> : <Entrar />} />
      <Route path="/*" element={eu ? <Moldura /> : <Navigate to="/entrar" replace state={{ voltar: location.pathname }} />} />
    </Routes>
  )
}

function Moldura() {
  const { eu, ehDeveloper, ehAdmin, suporte, fecharSuporte, sair, org } = useSessao()
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  const navegar = useNavigate()
  useEffect(() => setMenuAberto(false), [local.pathname])

  const veOrg = !!org
  const inicio = ehDeveloper && !suporte ? '/plataforma' : '/inicio'

  return (
    <div className="moldura">
      <a className="pular" href="#conteudo">Pular para o conteúdo</a>
      <aside className={`lateral${menuAberto ? ' aberta' : ''}`}>
        <div className="marca">
          <span className="marca-icone" aria-hidden="true" />
          <span>Contratos</span>
        </div>
        <nav aria-label="Principal">
          {ehDeveloper && (
            <div className="grupo">
              <p className="grupo-titulo">Plataforma</p>
              <NavLink to="/plataforma" end>Organizações</NavLink>
              <NavLink to="/plataforma/saude">Saúde</NavLink>
              <NavLink to="/plataforma/auditoria">Auditoria</NavLink>
            </div>
          )}
          {veOrg && (
            <div className="grupo">
              <p className="grupo-titulo">{org.nome}</p>
              <NavLink to="/inicio">Visão geral</NavLink>
              <NavLink to="/contratos">Contratos</NavLink>
              <NavLink to="/lotes">Lotes</NavLink>
              {ehAdmin && <>
                <NavLink to="/empresa">Dados da empresa</NavLink>
                <NavLink to="/usuarios">Usuários</NavLink>
                <NavLink to="/chaves">Chaves de API</NavLink>
                <NavLink to="/webhooks">Webhooks</NavLink>
              </>}
            </div>
          )}
        </nav>
        <div className="quem">
          <strong>{eu.usuario.nome}</strong>
          <span>{eu.usuario.papel_rotulo}</span>
          <div className="quem-acoes">
            <NavLink to="/conta">Minha conta</NavLink>
            <button className="link-botao" onClick={async () => { await sair(); navegar('/entrar') }}>Sair</button>
          </div>
        </div>
      </aside>

      <div className="principal">
        <div className="barra-topo">
          <button className="botao secundario pequeno" aria-expanded={menuAberto} onClick={() => setMenuAberto(v => !v)}>Menu</button>
          <span>{org?.nome || 'Plataforma'}</span>
        </div>
        {suporte && (
          <div className="faixa-suporte" role="status">
            Você está vendo <strong>{suporte.nome}</strong> como suporte. Só consulta: nada pode ser alterado daqui.
            <button className="link-botao" onClick={() => { fecharSuporte(); navegar('/plataforma') }}>Voltar à plataforma</button>
          </div>
        )}
        {eu.organizacao?.status === 'suspensa' && (
          <div className="faixa-suporte erro" role="status">Esta organização está suspensa. Você pode consultar, mas não gerar nem enviar. Fale com o suporte da plataforma.</div>
        )}
        <main id="conteudo" className="conteudo-painel">
          <Routes>
            <Route path="/" element={<Navigate to={inicio} replace />} />
            <Route path="/conta" element={<Conta />} />
            {veOrg && <>
              <Route path="/inicio" element={<VisaoGeral />} />
              <Route path="/contratos" element={<Contratos />} />
              <Route path="/contratos/novo" element={<NovoContrato />} />
              <Route path="/contratos/:id" element={<Contrato />} />
              <Route path="/lotes" element={<Lotes />} />
              <Route path="/lotes/:id" element={<Lote />} />
            </>}
            {ehAdmin && <>
              <Route path="/empresa" element={<Empresa />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/chaves" element={<Chaves />} />
              <Route path="/webhooks" element={<Webhooks />} />
            </>}
            {ehDeveloper && <>
              <Route path="/plataforma" element={<Organizacoes />} />
              <Route path="/plataforma/organizacoes/:id" element={<Organizacao />} />
              <Route path="/plataforma/saude" element={<Saude />} />
              <Route path="/plataforma/auditoria" element={<Auditoria />} />
            </>}
            <Route path="*" element={<p className="vazio">Esta página não existe ou seu papel não dá acesso a ela. <NavLink to={inicio}>Voltar ao início</NavLink></p>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
