import { useCallback, useEffect, useRef, useState } from 'react'

// Carrega dados e expõe recarregar. `deps` muda → carrega de novo.
export function useDados(fn, deps = []) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true })
  const vivo = useRef(true)
  const carregar = useCallback(async () => {
    setEstado(e => ({ ...e, carregando: true }))
    try {
      const dados = await fn()
      if (vivo.current) setEstado({ dados, erro: null, carregando: false })
    } catch (erro) {
      if (vivo.current) setEstado(e => ({ ...e, erro, carregando: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { vivo.current = true; carregar(); return () => { vivo.current = false } }, [carregar])
  return { ...estado, recarregar: carregar }
}

// Executa uma ação com estado de "trabalhando" e erro, sem repetir try/catch em toda tela.
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState(null)
  const executar = useCallback(async (fn) => {
    setOcupado(true)
    setErro(null)
    try { return await fn() } catch (e) { setErro(e); return undefined } finally { setOcupado(false) }
  }, [])
  return { ocupado, erro, executar, limparErro: () => setErro(null) }
}

export const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

// Endereço pode vir como texto ou como objeto (cadastro importado).
export function endereco(v) {
  if (!v || typeof v !== 'object') return v ?? ''
  const cep = v.cep ? `, CEP ${String(v.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}` : ''
  return `${v.logradouro}, nº ${v.numero}${v.complemento ? `, ${v.complemento}` : ''}${v.bairro ? `, ${v.bairro}` : ''}, ${v.cidade}/${v.uf}${cep}`
}

export function dataHora(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
export function data(iso) {
  if (!iso) return '—'
  // Data pura (vigência, reajuste) é um dia do calendário, não um instante:
  // passar por fuso a transforma em meia-noite UTC e "01/11" vira "31/10".
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

export const SITUACAO = {
  gerado: 'gerado', enviado: 'aguardando', parcialmente_assinado: 'assinado em parte', assinado: 'assinado',
  recusado: 'recusado', expirado: 'expirado', cancelado: 'cancelado', nao_gerado: 'não gerado',
  encerrado: 'encerrado', distratado: 'distratado',
}
export const PESSOA = { aguardando: 'aguardando a vez', notificado: 'não abriu', identificado: 'lendo', assinado: 'assinou', recusado: 'recusou' }

export function Situacao({ valor }) {
  return <span className={`status ${valor}`}>{SITUACAO[valor] || valor}</span>
}

export function Erro({ erro, onFechar }) {
  if (!erro) return null
  const detalhes = [...(erro.detalhes?.faltando || []), ...(erro.detalhes?.invalidos || [])]
  return (
    <div className="aviso erro" role="alert">
      {erro.message}
      {detalhes.length > 0 && <ul className="lista-curta">{detalhes.map((d, i) => <li key={i}>{d.rotulo}: {d.motivo}</li>)}</ul>}
      {onFechar && <button className="link-botao fechar" onClick={onFechar}>Fechar</button>}
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }) {
  return <p className="carregando" aria-live="polite">{texto}</p>
}

export function Cabecalho({ titulo, sub, children }) {
  return (
    <header className="pagina-topo">
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="acoes">{children}</div>}
    </header>
  )
}

export function Campo({ rotulo, dica, children, obrigatorio, classe = '' }) {
  return (
    <label className={`campo ${classe}`.trim()}>
      <span>{rotulo}{obrigatorio && <em className="obrig" aria-label="obrigatório"> *</em>}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  )
}

export function Copiar({ texto }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="botao secundario pequeno" onClick={async () => {
      try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 2000) } catch { /* sem permissão: a pessoa copia à mão */ }
    }}>{ok ? 'Copiado' : 'Copiar'}</button>
  )
}

export function Vazio({ children }) {
  return <p className="vazio">{children}</p>
}
