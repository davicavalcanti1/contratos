import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Erro, PESSOA, Situacao, dataHora, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const EVENTO = {
  'contrato.gerado': 'Contrato gerado', 'contrato.enviado': 'Enviado para assinatura', 'link.enviado': 'Link enviado',
  'link.aberto': 'Link aberto', 'otp.enviado': 'Código enviado', 'otp.falhou': 'Código incorreto',
  'otp.validado': 'Identidade confirmada', 'clausula.ciencia': 'Ciência de cláusula em destaque',
  'documento.lido_ate_o_fim': 'Leu até o fim', 'assinatura.aceita': 'Assinou', 'assinatura.recusada': 'Recusou',
  'documento.selado': 'Selado', 'contrato.cancelado': 'Cancelado', 'contrato.expirado': 'Expirou',
}

export function Contrato() {
  const { id } = useParams()
  const { podeEscrever, org } = useSessao()
  const { dados: c, erro, carregando, recarregar } = useDados(() => api(`/org/contratos/${id}`), [id, org?.id])
  const acao = useAcao()
  const [aviso, setAviso] = useState(null)

  if (carregando && !c) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const emAndamento = ['enviado', 'parcialmente_assinado'].includes(c.status)
  const podeCancelar = podeEscrever && ['gerado', 'enviado', 'parcialmente_assinado'].includes(c.status)

  const reenviar = (s) => acao.executar(async () => {
    await api(`/org/contratos/${c.id}/signatarios/${s.id}/reenviar`, { metodo: 'POST' })
    setAviso(`Novo link enviado para ${s.email}. O anterior deixou de valer.`)
    recarregar()
  })
  const cancelar = () => acao.executar(async () => {
    const motivo = window.prompt('Por que cancelar? Quem assina deixa de conseguir abrir o link.')
    if (motivo === null) return
    await api(`/org/contratos/${c.id}/cancelar`, { metodo: 'POST', corpo: { motivo } })
    recarregar()
  })

  return (
    <>
      <Cabecalho titulo={c.titulo} sub={<>
        <Situacao valor={c.status} />{' '}
        {c.referencia && <>referência <strong>{c.referencia}</strong>{' · '}</>}
        criado {dataHora(c.criado_em)}{c.expira_em && emAndamento && <>, vale até {dataHora(c.expira_em)}</>}
      </>}>
        <button className="botao secundario" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/arquivo?qual=original`, 'contrato.pdf'))}>PDF original</button>
        {c.status === 'assinado' && <button className="botao" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/arquivo?qual=final`, 'contrato-assinado.pdf'))}>PDF assinado</button>}
        <button className="botao secundario" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/dossie?formato=pdf`, 'dossie.pdf'))}>Dossiê de provas</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}

      <div className="duas-colunas">
        <section className="cartao">
          <h2>Quem assina</h2>
          {c.signatarios.length === 0 ? <p>Este contrato ainda não foi enviado.</p> : (
            <table className="tabela">
              <thead><tr><th>Pessoa</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {c.signatarios.map(s => (
                  <tr key={s.id}>
                    <td>{s.nome}<br /><small>{s.email}, {s.papel}</small></td>
                    <td>{PESSOA[s.status] || s.status}{s.assinado_em && <><br /><small>{dataHora(s.assinado_em)}</small></>}{s.recusa_motivo && <><br /><small>"{s.recusa_motivo}"</small></>}</td>
                    <td>{podeEscrever && emAndamento && ['notificado', 'identificado'].includes(s.status) && <button className="link-botao" disabled={acao.ocupado} onClick={() => reenviar(s)}>Reenviar link</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.codigo_verificacao && (
            <p className="selo-linha">Código de verificação <strong className="codigo-grande">{c.codigo_verificacao}</strong> <a href={`/v/${c.codigo_verificacao}`} target="_blank" rel="noopener noreferrer">Ver o selo</a></p>
          )}
          {podeCancelar && <button className="link-botao perigo" onClick={cancelar}>Cancelar este contrato</button>}
        </section>

        <section className="cartao">
          <h2>Histórico</h2>
          <ol className="linha-do-tempo">
            {c.eventos.slice().reverse().map(e => (
              <li key={e.seq}><span>{EVENTO[e.tipo] || e.tipo}</span><time>{dataHora(e.em)}</time></li>
            ))}
          </ol>
          <details>
            <summary>Códigos de integridade</summary>
            <p className="hash">Conteúdo: {c.conteudo_sha256}<br />PDF original: {c.pdf_original_sha256}{c.pdf_final_sha256 && <><br />PDF assinado: {c.pdf_final_sha256}</>}</p>
          </details>
        </section>
      </div>
    </>
  )
}
