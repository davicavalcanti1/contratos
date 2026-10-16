import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, SITUACAO, Vazio, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { ListaContratos } from './VisaoGeral.jsx'

const FILTROS = [
  ['', 'Todas as situações'],
  ['enviado,parcialmente_assinado', 'Aguardando assinatura'],
  ['assinado', 'Assinados'],
  ['recusado', 'Recusados'],
  ['expirado', 'Expirados'],
  ['cancelado', 'Cancelados'],
  ['encerrado,distratado', 'Encerrados e distratados'],
  ['gerado', 'Gerados e não enviados'],
]

export function Contratos() {
  const { podeEscrever, org } = useSessao()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const pagina = Number(params.get('pagina') || 1)
  const [busca, setBusca] = useState(params.get('busca') || '')

  // A busca vai para a URL com uma pequena espera: dá para colar o link e
  // voltar no navegador sem perder o filtro.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(params)
      if (busca) p.set('busca', busca); else p.delete('busca')
      p.delete('pagina')
      if (p.toString() !== params.toString()) setParams(p, { replace: true })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const q = new URLSearchParams({ limite: '25', pagina: String(pagina), ...(status && { status }), ...(params.get('busca') && { busca: params.get('busca') }) })
  const { dados, erro, carregando } = useDados(() => api(`/org/contratos?${q}`), [q.toString(), org?.id])

  const mudar = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p) }
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1

  return (
    <>
      <Cabecalho titulo="Contratos" sub={dados ? plural(dados.total, 'contrato', 'contratos') : ''}>
        {podeEscrever && <Link className="botao" to="/contratos/novo">Novo contrato</Link>}
      </Cabecalho>
      <div className="filtros">
        <label className="campo"><span className="sr">Buscar</span>
          <input type="search" placeholder="Buscar por nome, e-mail, título ou referência" value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
        <label className="campo"><span className="sr">Situação</span>
          <select value={status} onChange={e => mudar('status', e.target.value)}>
            {FILTROS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
      </div>
      <Erro erro={erro} />
      <section className="cartao">
        {carregando && !dados ? <Carregando />
          : dados.itens.length === 0 ? <Vazio>Nenhum contrato {status ? `com a situação "${FILTROS.find(f => f[0] === status)?.[1].toLowerCase() || SITUACAO[status]}"` : ''}{params.get('busca') ? ` para "${params.get('busca')}"` : ''}.</Vazio>
          : <ListaContratos itens={dados.itens} />}
        {paginas > 1 && (
          <nav className="paginacao" aria-label="Páginas">
            <button className="botao secundario pequeno" disabled={pagina <= 1} onClick={() => mudar('pagina', String(pagina - 1))}>Anterior</button>
            <span>Página {pagina} de {paginas}</span>
            <button className="botao secundario pequeno" disabled={pagina >= paginas} onClick={() => mudar('pagina', String(pagina + 1))}>Próxima</button>
          </nav>
        )}
      </section>
    </>
  )
}
