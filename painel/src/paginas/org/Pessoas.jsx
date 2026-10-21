// Diretório de pessoas e empresas: quem já recebeu um contrato desta
// organização, preenchido sozinho a cada contrato gerado. Daqui sai o
// próximo contrato da mesma pessoa, sem digitar o cadastro de novo.

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, data, plural, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const TIPO = { pf: 'Pessoa física', pj: 'Pessoa jurídica', mei: 'MEI' }
const POR_PAGINA = 50

export function Pessoas() {
  const { org, podeEscrever } = useSessao()
  const [params, setParams] = useSearchParams()
  const buscaUrl = params.get('busca') || ''
  const pagina = Number(params.get('pagina') || 1)
  const [busca, setBusca] = useState(buscaUrl)

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

  const q = new URLSearchParams({ limite: String(POR_PAGINA), pagina: String(pagina), ...(buscaUrl && { busca: buscaUrl }) })
  const { dados, erro, carregando } = useDados(() => api(`/org/partes?${q}`), [q.toString(), org?.id])
  const mudarPagina = (n) => { const p = new URLSearchParams(params); p.set('pagina', String(n)); setParams(p) }
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1

  return (
    <>
      <Cabecalho titulo="Pessoas" sub={dados
        ? `${plural(dados.total, 'pessoa ou empresa', 'pessoas e empresas')} que já ${dados.total === 1 ? 'recebeu' : 'receberam'} contrato${buscaUrl ? ` para "${buscaUrl}"` : ''}. O diretório se preenche sozinho a cada contrato gerado.`
        : ''}>
        {podeEscrever && <Link className="botao" to="/contratos/novo">Novo contrato</Link>}
      </Cabecalho>

      <div className="barra-filtros">
        <label className="campo busca">
          <span className="sr">Buscar</span>
          <input type="search" placeholder="Buscar por nome, CPF, CNPJ ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && <button type="button" className="limpar" aria-label="Limpar a busca" onClick={() => setBusca('')}>×</button>}
        </label>
      </div>

      <Erro erro={erro} />
      <section className="cartao cartao-lista">
        {carregando && !dados ? <Carregando />
          : dados.itens.length === 0 ? (
            <Vazio>
              {buscaUrl
                ? <>Ninguém com "{buscaUrl}" no diretório. <button type="button" className="link-botao pequeno-link" onClick={() => setBusca('')}>Limpar a busca</button></>
                : <>Ninguém ainda. As pessoas e empresas entram aqui quando o primeiro contrato delas é gerado{podeEscrever && <>: <Link to="/contratos/novo">gere o primeiro</Link></>}.</>}
            </Vazio>
          ) : (<>
            <ul className="lista-contratos-m">
              {dados.itens.map(p => (
                <li key={p.id}>
                  <Link to={`/contratos?busca=${encodeURIComponent(p.nome)}`}>{p.nome}</Link>
                  <span>{TIPO[p.tipo] || p.tipo}{p.cnpj ? ` · CNPJ ${p.cnpj}` : p.cpf ? ` · CPF ${p.cpf}` : ''}{p.email ? ` · ${p.email}` : ''}</span>
                  <div className="lista-contratos-m-rodape">
                    <small>{plural(p.contratos, 'contrato', 'contratos')}{p.ultimo_em ? `, último em ${data(p.ultimo_em)}` : ''}</small>
                    {podeEscrever && <Link className="link-botao pequeno-link" to={`/contratos/novo?parte=${p.id}`}>Novo contrato</Link>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="rolagem tabela-desktop">
              <table className="tabela">
                <thead><tr><th>Nome</th><th>Documento</th><th>E-mail</th><th>Contratos</th><th></th></tr></thead>
                <tbody>
                  {dados.itens.map(p => (
                    <tr key={p.id}>
                      <td><Link to={`/contratos?busca=${encodeURIComponent(p.nome)}`}>{p.nome}</Link><br /><small>{TIPO[p.tipo] || p.tipo}</small></td>
                      <td>{p.cnpj ? `CNPJ ${p.cnpj}` : p.cpf ? `CPF ${p.cpf}` : <small>—</small>}</td>
                      <td>{p.email || <small>—</small>}</td>
                      <td>
                        {plural(p.contratos, 'contrato', 'contratos')}
                        {p.ultimo_contrato_id && <><br /><small>último: <Link to={`/contratos/${p.ultimo_contrato_id}`}>{p.ultimo_titulo}</Link>, {data(p.ultimo_em)}</small></>}
                      </td>
                      <td className="acoes-linha">
                        {podeEscrever && <Link className="botao secundario pequeno" to={`/contratos/novo?parte=${p.id}`}>Novo contrato</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
        {dados && dados.total > dados.limite && (
          <nav className="paginacao" aria-label="Páginas">
            <span>{(dados.pagina - 1) * dados.limite + 1}–{Math.min(dados.total, dados.pagina * dados.limite)} de {dados.total}</span>
            <button className="botao secundario pequeno" disabled={pagina <= 1} onClick={() => mudarPagina(pagina - 1)}>Anterior</button>
            <button className="botao secundario pequeno" disabled={pagina >= paginas} onClick={() => mudarPagina(pagina + 1)}>Próxima</button>
          </nav>
        )}
      </section>
      <p className="nota">O diretório guarda os dados do último contrato de cada pessoa. Para corrigir algo, gere o próximo contrato com o dado certo: ele atualiza o cadastro.</p>
    </>
  )
}
