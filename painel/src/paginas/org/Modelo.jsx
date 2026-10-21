// Um modelo por dentro: o texto "em branco" com os campos entre « », as
// condições de cada cláusula, a bula, o que a organização preenche, o que
// vem do cadastro, os parâmetros com padrão e quem assina pela outra parte.

import { Link, useParams } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Erro, Fundamentos, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const TIPO = { texto: 'texto', cpf: 'CPF', cnpj: 'CNPJ', moeda: 'valor em reais', numero: 'número', percentual: 'percentual', data: 'data', email: 'e-mail', booleano: 'sim ou não', enum: 'escolha', endereco: 'endereço' }
const PAPEL = { parte: 'a própria parte', representante: 'o representante legal', testemunha: 'testemunha', interveniente: 'interveniente' }
const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())

// «rótulo» vira um campo visível; é o que muda de contrato para contrato.
function ComCampos({ texto }) {
  const partes = String(texto || '').split(/(«[^»]+»)/)
  return partes.map((p, i) => (p.startsWith('«') ? <span className="var" key={i}>{p.slice(1, -1)}</span> : p))
}

export function Modelo() {
  const { chave } = useParams()
  const { org, podeEscrever } = useSessao()
  const acao = useAcao()
  const { dados: m, erro, carregando } = useDados(() => api(`/org/modelos/${chave}`), [chave, org?.id])
  if (carregando && !m) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const preenche = m.variaveis.filter(v => ['manual', 'parte', 'fonte'].includes(v.origem))
  const daEmpresa = m.variaveis.filter(v => v.origem === 'organizacao')
  const parametros = m.variaveis.filter(v => v.origem === 'parametro')
  const padrao = (v) => (v.padrao == null ? null : v.opcoes ? (v.opcoes.find(o => o.valor === v.padrao)?.texto ?? v.padrao) : String(v.padrao))

  return (
    <>
      <p className="trilha-pagina"><Link to="/modelos">Modelos</Link> <span>/</span> {m.titulo}</p>
      <Cabecalho titulo={m.titulo} sub={`${m.descricao} · versão ${m.versao} · ${plural(m.clausulas, 'cláusula', 'cláusulas')}, ${m.criticas} em destaque`}>
        {podeEscrever && <Link className="botao" to={`/contratos/novo?modelo=${m.chave}`}>Novo contrato</Link>}
        <button type="button" className="botao secundario" disabled={acao.ocupado} onClick={() => acao.executar(() => baixar(`/org/modelos/${m.chave}/amostra.pdf`, `amostra-${m.chave}.pdf`))}>PDF de amostra</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />

      <div className="duas-colunas largas">
        <section className="cartao">
          <h2>O texto do modelo</h2>
          <p className="nota">Os campos entre « » são preenchidos a cada contrato. As cláusulas e os parágrafos marcados com "só quando" entram só nos casos indicados; a numeração se acerta sozinha no contrato gerado.</p>
          <div className="previa-corpo">
            <h3 className="previa-titulo"><ComCampos texto={m.texto.titulo} /></h3>
            {m.texto.preambulo && <p className="preambulo"><ComCampos texto={m.texto.preambulo} /></p>}
            <div className="documento compacto">
              {m.texto.clausulas.map((c, i) => (
                <article key={c.chave} className={`clausula${c.critica ? ' critica' : ''}`}>
                  <p className="cl-num">Cláusula {i + 1}{c.critica && <span className="destaque">Em destaque</span>}{c.condicao && <span className="condicao">Só quando {c.condicao}</span>}</p>
                  <h3>{c.titulo}</h3>
                  {c.resumo && <p className="bula"><span className="rotulo">Em palavras simples</span><mark><ComCampos texto={c.resumo} /></mark></p>}
                  <div className="texto-juridico">
                    {c.paragrafos.map((p, j) => <p key={j}>{p.condicao && <span className="condicao">Só quando {p.condicao}: </span>}<ComCampos texto={p.texto} /></p>)}
                    <Fundamentos itens={c.fundamentos} />
                  </div>
                </article>
              ))}
            </div>
            {m.texto.fecho && <p className="fecho"><ComCampos texto={m.texto.fecho} /></p>}
          </div>
        </section>

        <div className="coluna">
          <section className="cartao">
            <h2>O que você preenche</h2>
            <ul className="lista-campos">
              {preenche.map(v => <li key={v.chave}><strong>{cap(v.rotulo)}</strong><small>{TIPO[v.tipo] || v.tipo}{v.opcoes ? `: ${v.opcoes.map(o => o.texto).join(', ')}` : ''}{!v.obrigatoria ? ' · opcional' : ''}{v.origem === 'fonte' ? ' · da planilha' : ''}</small></li>)}
            </ul>
          </section>
          {parametros.length > 0 && (
            <section className="cartao">
              <h2>Com um padrão, se você não mudar</h2>
              <ul className="lista-campos">
                {parametros.map(v => <li key={v.chave}><strong>{cap(v.rotulo)}</strong><small>{padrao(v) != null ? `padrão: ${padrao(v)}` : 'sem padrão: você informa'}</small></li>)}
              </ul>
            </section>
          )}
          <section className="cartao">
            <h2>Vem do cadastro da empresa</h2>
            <ul className="lista-campos">
              {daEmpresa.map(v => <li key={v.chave}><strong>{cap(v.rotulo)}</strong></li>)}
            </ul>
            <p className="nota">Preenchido em <Link to="/empresa">Dados da empresa</Link>, uma vez só.</p>
          </section>
          {m.signatarios_da_parte.length > 0 && (
            <section className="cartao">
              <h2>Quem assina pela outra parte</h2>
              <ul className="lista-campos">
                {m.signatarios_da_parte.map((s, i) => <li key={i}><strong>{cap(PAPEL[s.papel] || s.papel)}: {s.nome}</strong><small>{s.condicao ? `quando ${s.condicao}` : 'sempre'} · link para {s.email}</small></li>)}
              </ul>
              <p className="nota">A empresa assina por quem você indicar ao enviar, ou pelo representante do cadastro.</p>
            </section>
          )}
          <section className="cartao">
            <h2>Sobre este modelo</h2>
            <dl className="dados">
              <dt>Versão</dt><dd>{m.versao}</dd>
              <dt>Título executivo</dt><dd>{m.titulo_executivo ? 'sim: cláusula com o art. 784 do CPC' : 'não se aplica a este tipo de documento'}</dd>
              <dt>Lote</dt><dd>{m.lote ? 'pode ser gerado pela planilha' : 'só um a um'}</dd>
              <dt>Agenda</dt><dd>{m.vida ? 'vigência, vencimento e reajuste acompanhados' : 'sem prazo acompanhado'}</dd>
              <dt>Gerados por vocês</dt><dd>{m.contratos_gerados}</dd>
            </dl>
            <p className="nota">O texto é redigido e revisado pela plataforma. Uma versão nova vale para os próximos contratos; os já gerados não mudam.</p>
          </section>
        </div>
      </div>
    </>
  )
}
