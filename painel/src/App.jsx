import { useEffect, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Carregando } from './comum.jsx'
import { useSessao } from './sessao.jsx'
import { Convite } from './paginas/Convite.jsx'
import { Entrar } from './paginas/Entrar.jsx'
import { Redefinir } from './paginas/Redefinir.jsx'
import { Conta } from './paginas/Conta.jsx'
import { Chaves } from './paginas/org/Chaves.jsx'
import { Contrato } from './paginas/org/Contrato.jsx'
import { Contratos } from './paginas/org/Contratos.jsx'
import { Agenda } from './paginas/org/Agenda.jsx'
import { Empresa } from './paginas/org/Empresa.jsx'
import { Lote } from './paginas/org/Lote.jsx'
import { Lotes, NovoLote } from './paginas/org/Lotes.jsx'
import { NovoContrato } from './paginas/org/NovoContrato.jsx'
import { Pessoas } from './paginas/org/Pessoas.jsx'
import { Usuarios } from './paginas/org/Usuarios.jsx'
import { VisaoGeral } from './paginas/org/VisaoGeral.jsx'
import { Webhooks } from './paginas/org/Webhooks.jsx'
import { Auditoria } from './paginas/plataforma/Auditoria.jsx'
import { Interessados } from './paginas/plataforma/Interessados.jsx'
import { Organizacao } from './paginas/plataforma/Organizacao.jsx'
import { Organizacoes } from './paginas/plataforma/Organizacoes.jsx'
import { Saude } from './paginas/plataforma/Saude.jsx'
import { Biblioteca } from './paginas/plataforma/Biblioteca.jsx'
import { EditorModelo } from './paginas/plataforma/EditorModelo.jsx'
import { EditorClausula } from './paginas/plataforma/EditorClausula.jsx'

export function App() {
  const { eu } = useSessao()
  if (eu === undefined) return <Carregando />
  return (
    <Routes>
      <Route path="/convite/:token" element={<Convite />} />
      <Route path="/redefinir/:token" element={<Redefinir />} />
      <Route path="/entrar" element={eu ? <Navigate to="/" replace /> : <Entrar />} />
      <Route path="/*" element={eu ? <Moldura /> : <Navigate to="/entrar" replace state={{ voltar: location.pathname }} />} />
    </Routes>
  )
}

// Ícones de traço do menu, 20px. Sem biblioteca: são poucos e simples.
const ICONES = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  contratos: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  agenda: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  lotes: 'M4 5h16v14H4zM4 10h16M10 5v14',
  pessoas: 'M3 5h18v14H3zM6.5 15.5a2.5 2.5 0 015 0M9 9.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3M14 9.5h4M14 13.5h4',
  empresa: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M9 10h.01M15 10h.01',
  usuarios: 'M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6zM20 19v-1a3 3 0 00-2-2.8M16 5.2a3 3 0 010 5.6',
  chaves: 'M14 10a4 4 0 10-3.5 3.97L13 11.5l1 1 1-1 1 1 2-2v-2zM9 15l-5 5v-3l2-2',
  webhooks: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  organizacoes: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5',
  saude: 'M3 12h4l3-7 4 14 3-7h4',
  auditoria: 'M9 5h9a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V9zM5 9h4V5M9 13h6M9 17h6',
  interessados: 'M3 13h5l2 3h4l2-3h5M3 13v6h18v-6M5 5h14l2 8H3z',
  biblioteca: 'M4 5a2 2 0 012-2h5v18H6a2 2 0 01-2-2zM11 3h7a2 2 0 012 2v14a2 2 0 01-2 2h-7M14 8h3M14 12h3',
}
function Icone({ nome }) {
  return <svg className="icone-menu" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONES[nome]} /></svg>
}
function Item({ to, icone, children, end }) {
  return <NavLink to={to} end={end}><Icone nome={icone} />{children}</NavLink>
}

function Moldura() {
  const { eu, ehDeveloper, ehAdmin, suporte, fecharSuporte, sair, org } = useSessao()
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  const navegar = useNavigate()
  useEffect(() => setMenuAberto(false), [local.pathname])

  const veOrg = !!org
  const inicio = ehDeveloper && !suporte ? '/plataforma' : '/inicio'
  const iniciais = eu.usuario.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

  return (
    <div className="moldura">
      <a className="pular" href="#conteudo">Pular para o conteúdo</a>
      {menuAberto && <button className="cortina" aria-label="Fechar o menu" onClick={() => setMenuAberto(false)} />}
      <aside className={`lateral${menuAberto ? ' aberta' : ''}`}>
        <div className="marca">
          <span className="marca-icone" aria-hidden="true" />
          <span>Contratos</span>
        </div>
        <nav aria-label="Principal">
          {ehDeveloper && (
            <div className="grupo">
              <p className="grupo-titulo">Plataforma</p>
              <Item to="/plataforma" icone="organizacoes" end>Organizações</Item>
              <Item to="/plataforma/biblioteca" icone="biblioteca">Biblioteca</Item>
              <Item to="/plataforma/interessados" icone="interessados">Interessados</Item>
              <Item to="/plataforma/saude" icone="saude">Saúde</Item>
              <Item to="/plataforma/auditoria" icone="auditoria">Auditoria</Item>
            </div>
          )}
          {veOrg && (
            <div className="grupo">
              <p className="grupo-titulo" title={org.nome}>{org.nome}</p>
              <Item to="/inicio" icone="inicio">Visão geral</Item>
              <Item to="/contratos" icone="contratos">Contratos</Item>
              <Item to="/agenda" icone="agenda">Agenda</Item>
              <Item to="/lotes" icone="lotes">Lotes</Item>
              <Item to="/pessoas" icone="pessoas">Pessoas</Item>
              {ehAdmin && <>
                <p className="grupo-titulo grupo-titulo-sub">Administração</p>
                <Item to="/empresa" icone="empresa">Dados da empresa</Item>
                <Item to="/usuarios" icone="usuarios">Usuários</Item>
                <Item to="/chaves" icone="chaves">Chaves de API</Item>
                <Item to="/webhooks" icone="webhooks">Webhooks</Item>
              </>}
            </div>
          )}
        </nav>
        <div className="quem">
          <span className="avatar" aria-hidden="true">{iniciais}</span>
          <div className="quem-texto">
            <strong>{eu.usuario.nome}</strong>
            <span>{eu.usuario.papel_rotulo}</span>
          </div>
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
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/lotes" element={<Lotes />} />
              <Route path="/lotes/novo" element={<NovoLote />} />
              <Route path="/lotes/:id" element={<Lote />} />
              <Route path="/pessoas" element={<Pessoas />} />
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
              <Route path="/plataforma/biblioteca" element={<Biblioteca />} />
              <Route path="/plataforma/biblioteca/modelos/:chave" element={<EditorModelo />} />
              <Route path="/plataforma/biblioteca/clausulas/:chave" element={<EditorClausula />} />
              <Route path="/plataforma/saude" element={<Saude />} />
              <Route path="/plataforma/interessados" element={<Interessados />} />
              <Route path="/plataforma/auditoria" element={<Auditoria />} />
            </>}
            <Route path="*" element={<p className="vazio">Esta página não existe ou seu papel não dá acesso a ela. <NavLink to={inicio}>Voltar ao início</NavLink></p>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
