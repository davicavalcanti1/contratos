import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { ListaContratos } from './ListaContratos.jsx'

// Filtros de situação, como chips com a contagem de cada um.
const FILTROS = [
  ['', 'Todos'],
  ['enviado,parcialmente_assinado', 'Aguardando'],
  ['assinado', 'Assinados'],
  ['gerado', 'Não enviados'],
  ['recusado,expirado', 'Recusados e expirados'],
  ['encerrado,distratado', 'Encerrados'],
  ['cancelado', 'Cancelados'],
]
const POR_PAGINA = 25

export function Contratos() {
  const { podeEscrever, org } = useSessao()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const pagina = Number(params.get('pagina') || 1)
  const buscaUrl = params.get('busca') || ''
  const [busca, setBusca] = useState(buscaUrl)

  // A busca vai para a URL com uma pequena espera: dá para colar o link e
  // voltar no navegador sem perder o filtro.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(params)
      if (busca.trim()) p.set('busca', busca.trim()); else p.delete('busca')
      p.delete('pagina')
      if (p.toString() !== params.toString()) setParams(p, { replace: true })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const q = new URLSearchParams({ limite: String(POR_PAGINA), pagina: String(pagina), ...(status && { status }), ...(buscaUrl && { busca: buscaUrl }) })
  const lista = useDados(() => api(`/org/contratos?${q}`), [q.toString(), org?.id])
  // Contagem de cada chip, com a mesma busca: a pessoa vê onde estão os resultados.
  const contagens = useDados(async () => {
    const pares = await Promise.all(FILTROS.map(async ([v]) => {
      const r = await api(`/org/contratos?limite=1${v ? `&status=${v}` : ''}${buscaUrl ? `&busca=${encodeURIComponent(buscaUrl)}` : ''}`)
      return [v, r.total]
    }))
    return Object.fromEntries(pares)
  }, [buscaUrl, org?.id])

  const mudar = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p) }
  const dados = lista.dados
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1
  const de = dados ? (dados.pagina - 1) * dados.limite + 1 : 0
  const ate = dados ? Math.min(dados.total, dados.pagina * dados.limite) : 0
  const rotuloFiltro = FILTROS.find(f => f[0] === status)?.[1]
  const totalGeral = contagens.dados?.[''] ?? dados?.total

  return (
    <>
      <Cabecalho titulo="Contratos" sub={totalGeral != null ? plural(totalGeral, 'contrato', 'contratos') + (buscaUrl ? ` para "${buscaUrl}"` : '') : ''}>
        {podeEscrever && <Link className="botao" to="/contratos/novo">Novo contrato</Link>}
      </Cabecalho>

      <div className="barra-filtros">
        <label className="campo busca">
          <span className="sr">Buscar</span>
          <input type="search" placeholder="Buscar por nome, e-mail, título ou referência" value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && <button type="button" className="limpar" aria-label="Limpar a busca" onClick={() => setBusca('')}>×</button>}
        </label>
        <div className="chips" role="group" aria-label="Situação">
          {FILTROS.map(([v, r]) => {
            const n = contagens.dados?.[v]
            if (v && n === 0 && status !== v) return null // chip sem nada some, menos o escolhido
            return (
              <button key={v} type="button" className="chip" aria-pressed={status === v} onClick={() => mudar('status', v)}>
                {r}{n != null && <b>{n}</b>}
              </button>
            )
          })}
        </div>
      </div>

      <Erro erro={lista.erro} />
      <section className="cartao cartao-lista">
        {lista.carregando && !dados ? <Carregando />
          : dados.itens.length === 0 ? (
            <Vazio>
              {buscaUrl || status
                ? <>Nenhum contrato {status ? `em "${rotuloFiltro.toLowerCase()}"` : ''}{buscaUrl ? ` para "${buscaUrl}"` : ''}. <button type="button" className="link-botao pequeno-link" onClick={() => { setBusca(''); setParams({}) }}>Limpar os filtros</button></>
                : <>Nenhum contrato ainda.{podeEscrever && <> <Link to="/contratos/novo">Gere o primeiro</Link> ou envie um <Link to="/lotes">lote pela planilha</Link>.</>}</>}
            </Vazio>
          ) : <ListaContratos itens={dados.itens} />}
        {dados && dados.total > dados.limite && (
          <nav className="paginacao" aria-label="Páginas">
            <span>{de}–{ate} de {dados.total}</span>
            <button className="botao secundario pequeno" disabled={pagina <= 1} onClick={() => mudar('pagina', String(pagina - 1))}>Anterior</button>
            <button className="botao secundario pequeno" disabled={pagina >= paginas} onClick={() => mudar('pagina', String(pagina + 1))}>Próxima</button>
          </nav>
        )}
      </section>
    </>
  )
}
