// Interessados: quem pediu o contrato de exemplo pelo site, e até onde foi
// (abriu o link, confirmou o código, leu, assinou). É a lista de quem ligar.

import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, dataHora, plural, useDados } from '../../comum.jsx'

function etapa(i) {
  const c = i.contrato
  if (!c) return { texto: 'Sem contrato', classe: '' }
  if (c.status === 'assinado') return { texto: `Assinou ${dataHora(c.assinado_em)}`, classe: 'assinado' }
  if (c.status === 'recusado') return { texto: 'Recusou', classe: 'recusado' }
  if (c.status === 'expirado') return { texto: 'Expirou sem assinar', classe: 'expirado' }
  if (i.leitura_completa_em) return { texto: 'Leu até o fim, não assinou', classe: 'enviado' }
  if (i.identificado_em) return { texto: `Abriu e confirmou o código ${dataHora(i.identificado_em)}`, classe: 'enviado' }
  return { texto: 'Ainda não abriu', classe: 'gerado' }
}

const FILTROS = [['', 'Todos'], ['assinou', 'Assinaram'], ['abriu', 'Abriram, não assinaram'], ['nada', 'Não abriram']]
const grupo = (i) => (i.contrato?.status === 'assinado' ? 'assinou' : i.identificado_em ? 'abriu' : 'nada')

export function Interessados() {
  const { dados, erro, carregando } = useDados(() => api('/plataforma/interessados'), [])
  const [filtro, setFiltro] = useState('')
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const itens = dados.filter(i => !filtro || grupo(i) === filtro)
  const assinaram = dados.filter(i => grupo(i) === 'assinou').length
  return (
    <>
      <Cabecalho titulo="Interessados" sub={dados.length
        ? `${plural(dados.length, 'pessoa pediu', 'pessoas pediram')} o contrato de exemplo pelo site · ${assinaram} ${assinaram === 1 ? 'assinou' : 'assinaram'}. Quem assinou já viu o produto inteiro: é a primeira ligação.`
        : 'Ninguém pediu o contrato de exemplo pelo site ainda. Quando pedirem, você recebe um e-mail e a pessoa aparece aqui.'} />
      {dados.length > 0 && (
        <div className="chips chips-lote" role="group" aria-label="Etapa">
          {FILTROS.map(([v, r]) => <button key={v} type="button" className="chip" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{r}<b>{v ? dados.filter(i => grupo(i) === v).length : dados.length}</b></button>)}
        </div>
      )}
      <section className="cartao cartao-lista">
        {itens.length === 0 ? <Vazio>Ninguém nesta etapa.</Vazio> : (
          <div className="rolagem">
            <table className="tabela">
              <thead><tr><th>Quando</th><th>Quem</th><th>Contato</th><th>Até onde foi</th></tr></thead>
              <tbody>
                {itens.map(i => {
                  const e = etapa(i)
                  return (
                    <tr key={i.id}>
                      <td><small>{dataHora(i.em)}</small></td>
                      <td><strong>{i.nome}</strong>{i.empresa && <><br /><small>{i.empresa}</small></>}</td>
                      <td><a href={`mailto:${i.email}`}>{i.email}</a>{i.telefone && <><br /><small>WhatsApp {i.telefone}</small></>}</td>
                      <td>
                        <span className={`status ${e.classe}`}>{e.texto}</span>
                        {i.contrato?.codigo_verificacao && <><br /><small><a href={`/v/${i.contrato.codigo_verificacao}`} target="_blank" rel="noopener noreferrer">ver o selo</a></small></>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="nota">Os contratos de exemplo ficam na organização "Clínica Exemplo" (demonstração). Para ver um deles por dentro, abra essa organização como suporte.</p>
    </>
  )
}
