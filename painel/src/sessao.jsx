import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, definirSuporte } from './api.js'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

// Edição (docs/BASICA.md): o servidor diz em /eu o que está ligado. Sem a
// informação (servidor antigo), tudo ligado.
const TUDO = { nome: 'completa', lei: true, icp: true, carimbo: true, pacote: true, derivados: true, agenda: true, reajuste: true, api: true, modelos: true, demo: true, exportar: true, plano: true, dev: true }

export function ProvedorSessao({ children }) {
  const [eu, setEu] = useState(undefined) // undefined = verificando; null = sem sessão
  const [suporte, setSuporte] = useState(null) // { id, nome } quando o developer abre uma organização

  const atualizar = useCallback(async () => {
    try { setEu(await api('/eu')) } catch { setEu(null) }
  }, [])

  useEffect(() => { atualizar() }, [atualizar])
  useEffect(() => {
    const expirou = () => { setEu(null); setSuporte(null); definirSuporte(null) }
    window.addEventListener('sessao-expirada', expirou)
    return () => window.removeEventListener('sessao-expirada', expirou)
  }, [])

  const entrar = async (email, senha) => setEu(await api('/sessao', { metodo: 'POST', corpo: { email, senha } }))
  const sair = async () => { await api('/sessao', { metodo: 'DELETE' }).catch(() => {}); definirSuporte(null); setSuporte(null); setEu(null) }
  const abrirSuporte = (org) => { definirSuporte(org.id); setSuporte(org) }
  const fecharSuporte = () => { definirSuporte(null); setSuporte(null) }

  const papel = eu?.usuario.papel
  const valor = {
    eu, setEu, entrar, sair, atualizar,
    suporte, abrirSuporte, fecharSuporte,
    ehDeveloper: papel === 'developer',
    ehAdmin: papel === 'org_admin',
    podeEscrever: !suporte && ['org_admin', 'emissor'].includes(papel),
    edicao: eu?.edicao || TUDO,
    // A organização em foco: a do usuário, ou a aberta em modo suporte.
    org: suporte || eu?.organizacao || null,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
