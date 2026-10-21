// Modelos disponíveis para a organização: o que cada um contém, para quê
// serve, e os atalhos para ver por dentro, gerar um contrato ou baixar um
// PDF de amostra para o advogado da casa.

import { Link } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export function Modelos() {
  const { org, podeEscrever } = useSessao()
  const acao = useAcao()
  const { dados, erro, carregando } = useDados(async () => {
    const lista = await api('/org/modelos')
    return Promise.all(lista.map(m => api(`/org/modelos/${m.chave}`)))
  }, [org?.id])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  return (
    <>
      <Cabecalho titulo="Modelos" sub="Os modelos que a sua organização pode usar, revisados e publicados pela plataforma. Veja cada um por dentro antes de gerar, ou baixe o PDF de amostra para o seu advogado." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {dados.length === 0 ? <Vazio>Nenhum modelo publicado para a sua organização. Fale com o suporte da plataforma.</Vazio> : (
        <div className="modelos-grade">
          {dados.map(m => (
            <article className="cartao modelo-resumo" key={m.chave}>
              <h2><Link to={`/modelos/${m.chave}`}>{m.titulo}</Link></h2>
              <p className="modelo-descricao">{m.descricao}</p>
              <ul className="modelo-fatos">
                <li>{plural(m.clausulas, 'cláusula', 'cláusulas')}, {m.criticas} em destaque com bula</li>
                <li>{plural(m.variaveis.filter(v => !['organizacao', 'calculada'].includes(v.origem)).length, 'campo que você preenche', 'campos que você preenche')}</li>
                {m.lote && <li>Pronto para lote pela planilha</li>}
                {m.vida && <li>Com vigência, vencimento e reajuste na agenda</li>}
                <li>{m.contratos_gerados ? `${plural(m.contratos_gerados, 'contrato gerado', 'contratos gerados')} por vocês` : 'Nenhum contrato gerado ainda'}</li>
              </ul>
              <div className="acoes">
                <Link className="botao secundario pequeno" to={`/modelos/${m.chave}`}>Ver por dentro</Link>
                {podeEscrever && <Link className="botao pequeno" to={`/contratos/novo?modelo=${m.chave}`}>Novo contrato</Link>}
                <button type="button" className="link-botao pequeno-link" disabled={acao.ocupado} onClick={() => acao.executar(() => baixar(`/org/modelos/${m.chave}/amostra.pdf`, `amostra-${m.chave}.pdf`))}>PDF de amostra</button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="nota">Os modelos são redigidos e revisados pela plataforma; a sua organização preenche e envia. Precisa de uma cláusula própria ou de outro modelo? Fale com o suporte: a gente migra os seus contratos, com bula.</p>
    </>
  )
}
