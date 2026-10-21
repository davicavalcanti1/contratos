// Detalhe do contrato: o que foi preenchido, quem assina e como vai, o selo e
// a história completa. Aditivo e distrato ficam em VidaContrato.jsx.

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, baixar } from '../../api.js'
import { Cabecalho, Carregando, Copiar, Erro, PESSOA, Situacao, data, dataHora, endereco, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { AcoesVida, Ligados, Vigencia } from './VidaContrato.jsx'

const PAPEL = { parte: 'Parte', representante: 'Representante legal', testemunha: 'Testemunha', interveniente: 'Interveniente' }
const GRUPO = { contratado: 'Quem é contratado', colaborador: 'Colaborador', contrato: 'O contrato', termo: 'Condições do termo' }
const cap = (s) => String(s ?? '').replace(/^./, c => c.toUpperCase())
const encurtar = (rotulo) => rotulo.replace(/\s*\(ou do titular do MEI\)/i, '').replace(/\s+(do|da|dos|das)\s+(contratad[oa]|colaborador|contratante)$/i, '')

export function Contrato() {
  const { id } = useParams()
  const { podeEscrever, org } = useSessao()
  const { dados: c, erro, carregando, recarregar } = useDados(() => api(`/org/contratos/${id}`), [id, org?.id])
  const modelos = useDados(() => api('/org/modelos').catch(() => []), [org?.id])
  const acao = useAcao()
  const [aviso, setAviso] = useState(null)
  const navegar = useNavigate()

  if (carregando && !c) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const emAndamento = ['enviado', 'parcialmente_assinado'].includes(c.status)
  const podeCancelar = podeEscrever && ['gerado', 'enviado', 'parcialmente_assinado'].includes(c.status)
  const assinaram = c.signatarios.filter(s => s.status === 'assinado').length
  const modelo = (modelos.dados || []).find(m => m.chave === c.modelo?.chave)
  const dias = c.expira_em ? Math.ceil((new Date(c.expira_em) - Date.now()) / 864e5) : null

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
      <p className="trilha-pagina"><Link to="/contratos">Contratos</Link> <span>/</span> {c.referencia || c.titulo}</p>
      <Cabecalho titulo={c.titulo} sub={<span className="detalhe-sub">
        <Situacao valor={c.status} />
        {c.referencia && <span>ref. <strong>{c.referencia}</strong></span>}
        <span>criado {dataHora(c.criado_em)}</span>
        {emAndamento && dias != null && <span className={dias <= 3 ? 'urgente' : ''}>{dias < 0 ? 'prazo vencido' : dias === 0 ? 'expira hoje' : `expira em ${plural(dias, 'dia', 'dias')}`}</span>}
        {c.assinado_em && <span>assinado {dataHora(c.assinado_em)}</span>}
      </span>}>
        {c.pdf_final_sha256
          ? <button className="botao" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/arquivo?qual=final`, 'contrato-assinado.pdf'))}>PDF assinado</button>
          : <button className="botao" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/arquivo?qual=original`, 'contrato.pdf'))}>PDF do contrato</button>}
        <button className="botao secundario" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/dossie?formato=pdf`, 'dossie.pdf'))}>Dossiê de provas</button>
        {c.pdf_final_sha256 && <button className="link-botao" onClick={() => acao.executar(() => baixar(`/org/contratos/${c.id}/arquivo?qual=original`, 'contrato.pdf'))}>PDF original</button>}
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}

      {c.status === 'distratado' && <p className="aviso info">Encerrado por distrato em {data(c.distrato?.data_encerramento)}, por acordo das partes.</p>}
      {c.status === 'assinado' && c.distrato && <p className="aviso info">Distrato assinado: este contrato vale até {data(c.distrato.data_encerramento)} e termina nessa data.</p>}
      {c.encerrado_em && <p className="aviso info">Encerrado no fim do prazo, em {dataHora(c.encerrado_em)}.</p>}
      {c.status === 'gerado' && <p className="aviso info">Este contrato foi gerado, mas ainda não foi enviado para ninguém assinar.</p>}

      <div className="duas-colunas largas detalhe">
        <div className="coluna">
          <section className="cartao">
            <div className="cartao-topo">
              <h2>Quem assina</h2>
              {c.signatarios.length > 0 && <span className="nota">{assinaram} de {c.signatarios.length} {c.signatarios.length === 1 ? 'assinatura' : 'assinaturas'}{c.ordem === 'sequencial' ? ' · um de cada vez' : ''}</span>}
            </div>
            {c.signatarios.length === 0 ? <p className="vazio">Ninguém ainda: o contrato não foi enviado.</p> : (
              <ul className="pessoas">
                {c.signatarios.map(s => <Pessoa key={s.id} s={s} c={c} podeReenviar={podeEscrever && emAndamento && ['aguardando', 'notificado', 'identificado'].includes(s.status)} ocupado={acao.ocupado} onReenviar={() => reenviar(s)} onBaixarIcp={() => acao.executar(() => baixar(`/org/contratos/${c.id}/assinaturas/${s.id}/arquivo`, 'assinatura-icp.pdf'))} />)}
              </ul>
            )}
            {podeCancelar && <p className="cartao-rodape"><button className="link-botao perigo" onClick={cancelar}>Cancelar este contrato</button></p>}
          </section>

          <Vigencia c={c} />
          <Ligados c={c} />
          {podeEscrever && <div id="mudar"><AcoesVida c={c} onGerado={(d) => navegar(`/contratos/${d.id}`)} /></div>}

          <DadosPreenchidos dados={c.dados} modelo={modelo} />
        </div>

        <div className="coluna">
          <Selo c={c} baixarTsr={() => acao.executar(() => baixar(`/org/contratos/${c.id}/carimbo.tsr`, 'carimbo.tsr'))} />
          <Historico c={c} />
        </div>
      </div>
    </>
  )
}

function Pessoa({ s, c, podeReenviar, ocupado, onReenviar, onBaixarIcp }) {
  const iniciais = s.nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  const estado = s.status === 'assinado' ? 'ok' : s.status === 'recusado' ? 'mal' : ''
  const quando = s.assinado_em ? `assinou em ${dataHora(s.assinado_em)}` : s.recusado_em ? `recusou em ${dataHora(s.recusado_em)}` : PESSOA[s.status] || s.status
  return (
    <li className={`pessoa ${estado}`}>
      <span className="avatar" aria-hidden="true">{iniciais}</span>
      <div className="pessoa-texto">
        <strong>{s.nome}</strong>
        <span>{s.email} · {PAPEL[s.papel] || s.papel}{s.metodo === 'icp' ? ' · certificado ICP-Brasil' : ''}</span>
        {s.recusa_motivo && <span className="pessoa-motivo">"{s.recusa_motivo}"</span>}
        {s.certificado && <span>Certificado de {s.certificado.nome} · <button className="link-botao pequeno-link" onClick={onBaixarIcp}>PDF assinado por ele</button></span>}
      </div>
      <div className="pessoa-estado">
        <span className={`status ${s.status === 'assinado' ? 'assinado' : s.status === 'recusado' ? 'recusado' : 'enviado'}`}>{cap(quando)}</span>
        {podeReenviar && <button className="link-botao pequeno-link" disabled={ocupado} onClick={onReenviar}>Reenviar link</button>}
      </div>
    </li>
  )
}

// O selo público e tudo que prova a integridade.
function Selo({ c, baixarTsr }) {
  const ct = c.carimbo
  const url = c.codigo_verificacao ? `${location.origin}/v/${c.codigo_verificacao}` : null
  return (
    <section className="cartao">
      <h2>Selo e integridade</h2>
      {c.codigo_verificacao ? (
        <div className="selo-bloco">
          <p className="selo-codigo"><span>Código de verificação</span><strong className="codigo-grande">{c.codigo_verificacao}</strong></p>
          <div className="acoes">
            <a className="botao secundario pequeno" href={url} target="_blank" rel="noopener noreferrer">Abrir o selo</a>
            <Copiar texto={url} />
          </div>
          <p className="nota">Impresso em cada página do PDF assinado, com o QR. Qualquer pessoa confere.</p>
        </div>
      ) : <p className="nota">O código de verificação é criado quando todos assinarem.</p>}

      {(ct || c.carimbo_pendente) && (
        <p className="selo-carimbo">
          {ct
            ? <>Carimbo do tempo de <strong>{ct.act}</strong>{ct.icp_brasil ? ' (ICP-Brasil)' : ' (fora da ICP-Brasil)'}, {dataHora(ct.gen_time)}. <button className="link-botao pequeno-link" onClick={baixarTsr}>Baixar .tsr</button></>
            : <>Carimbo do tempo pendente: a autoridade não respondeu. Tentamos de novo sozinhos.</>}
        </p>
      )}

      <details className="integridade">
        <summary>Códigos de integridade (SHA-256)</summary>
        <dl className="hashes">
          <dt>Conteúdo</dt><dd className="hash">{c.conteudo_sha256}</dd>
          <dt>PDF original</dt><dd className="hash">{c.pdf_original_sha256}</dd>
          {c.pdf_final_sha256 && <><dt>PDF assinado</dt><dd className="hash">{c.pdf_final_sha256}</dd></>}
        </dl>
      </details>
    </section>
  )
}

// Os valores que geraram este contrato, com os rótulos do modelo.
function DadosPreenchidos({ dados, modelo }) {
  const grupos = Object.entries(dados || {}).filter(([g, v]) => g !== 'organizacao' && v && typeof v === 'object' && Object.keys(v).length)
  if (grupos.length === 0) return null
  const def = (chave) => modelo?.variaveis.find(v => v.chave === chave)
  const formatar = (chave, valor) => {
    const d = def(chave)
    if (valor && typeof valor === 'object') return endereco(valor)
    if (d?.tipo === 'enum') return cap(d.opcoes?.find(o => o.valor === valor)?.texto ?? valor)
    if (d?.tipo === 'moeda') { const n = Number(String(valor).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : String(valor) }
    if (d?.tipo === 'data') return data(valor)
    if (d?.tipo === 'percentual') return `${valor}%`
    return String(valor)
  }
  return (
    <section className="cartao">
      <h2>Dados preenchidos</h2>
      {grupos.map(([g, campos]) => (
        <div className="dados-grupo" key={g}>
          <h3>{GRUPO[g] || cap(g)}</h3>
          <dl className="dados-lista">
            {Object.entries(campos).map(([k, v]) => {
              const chave = `${g}.${k}`
              const d = def(chave)
              return <div key={k}><dt title={d?.rotulo}>{d ? cap(encurtar(d.rotulo)) : cap(k.replace(/_/g, ' '))}</dt><dd>{formatar(chave, v)}</dd></div>
            })}
          </dl>
        </div>
      ))}
    </section>
  )
}

// A trilha, contada em frases: quem fez o quê, e em qual cláusula.
const EVENTO = {
  'contrato.gerado': () => 'Contrato gerado',
  'contrato.enviado': (d) => `Enviado para assinatura${d.ordem === 'sequencial' ? ', um de cada vez' : ''}${d.expira_em ? `, vale até ${data(d.expira_em.slice(0, 10))}` : ''}`,
  'link.enviado': (d) => `Link enviado${d.destino ? ` para ${d.destino}` : ''}`,
  'lembrete.enviado': (d) => `Lembrete enviado${d.destino ? ` para ${d.destino}` : ''}${d.dias ? `, ${plural(d.dias, 'dia', 'dias')} antes de expirar` : ''}`,
  'link.aberto': () => 'abriu o link',
  'otp.enviado': (d) => `pediu o código${d.destino ? ` (${d.destino})` : ''}`,
  'otp.falhou': (d) => `errou o código${d.tentativa ? ` (tentativa ${d.tentativa})` : ''}`,
  'otp.validado': () => 'confirmou a identidade',
  'clausula.ciencia': (d, cl) => `deu ciência na cláusula ${d.numero ?? cl?.numero ?? ''}${cl?.titulo ? `, ${cl.titulo.replace(/^D[aoe]s? /, '').toLowerCase()}` : ''}`,
  'documento.lido_ate_o_fim': () => 'leu até o fim',
  'assinatura.aceita': (d) => `assinou${d.metodo === 'icp_brasil' ? ' com certificado ICP-Brasil' : ''}${d.nome_digitado ? ` como "${d.nome_digitado}"` : ''}${d.ciencias ? `, com ${plural(d.ciencias, 'ciência', 'ciências')}` : ''}`,
  'assinatura.recusada': (d) => `recusou${d.motivo ? `: "${d.motivo}"` : ''}`,
  'icp.recusado': (d) => `tentou assinar com certificado e não foi aceito${d.motivo ? ` (${d.motivo})` : ''}`,
  'documento.selado': (d) => `Documento selado${d.codigo_verificacao ? `, código ${d.codigo_verificacao}` : ''}`,
  'documento.carimbado': (d) => `Carimbo do tempo aplicado${d.act ? ` por ${d.act}` : ''}`,
  'carimbo.pendente': (d) => `Carimbo do tempo pendente${d.motivo ? ` (${d.motivo})` : ''}`,
  'contrato.cancelado': (d) => `Cancelado${d.motivo ? `: "${d.motivo}"` : ''}`,
  'contrato.expirado': () => 'Prazo de assinatura expirou',
  'aditivo.gerado': () => 'Termo aditivo gerado',
  'distrato.gerado': () => 'Distrato gerado',
  'contrato.aditado': (d) => `Aditado: ${(d.mudancas || []).map(m => m.campo).join(', ') || 'aditivo assinado'}`,
  'contrato.distratado': (d) => `Distratado${d.data_encerramento ? `, encerrado em ${data(d.data_encerramento)}` : ''}`,
  'distrato.assinado': (d) => `Distrato assinado${d.data_encerramento ? `: vale até ${data(d.data_encerramento)}` : ''}`,
  'contrato.encerrado': () => 'Encerrado no fim do prazo',
}
const MARCOS = new Set(['contrato.gerado', 'contrato.enviado', 'assinatura.aceita', 'assinatura.recusada', 'documento.selado', 'contrato.cancelado', 'contrato.expirado', 'contrato.aditado', 'contrato.distratado', 'contrato.encerrado'])

function Historico({ c }) {
  const [tudo, setTudo] = useState(false)
  const porId = Object.fromEntries(c.signatarios.map(s => [s.id, s]))
  const porChave = Object.fromEntries((c.clausulas || []).map(cl => [cl.chave, cl]))
  const eventos = c.eventos.slice().reverse()
  const visiveis = tudo ? eventos : eventos.filter(e => MARCOS.has(e.tipo))
  const frase = (e) => {
    const d = e.dados || {}
    const texto = (EVENTO[e.tipo] || (() => e.tipo))(d, porChave[d.clausula])
    const sid = String(e.ator || '').startsWith('signatario:') ? e.ator.slice('signatario:'.length) : null
    const quem = sid ? (porId[sid]?.nome.split(' ')[0] || 'Signatário') : null
    return quem ? `${quem} ${texto}` : cap(texto)
  }
  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Histórico</h2>
        <button type="button" className="link-botao pequeno-link" onClick={() => setTudo(v => !v)}>{tudo ? 'Só os marcos' : `Tudo (${eventos.length})`}</button>
      </div>
      <ol className="linha-do-tempo">
        {visiveis.map(e => (
          <li key={e.seq} className={MARCOS.has(e.tipo) ? 'marco' : ''}>
            <span>{frase(e)}{tudo && e.ip && !['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(e.ip) && <small className="ip"> · {e.ip}</small>}</span>
            <time dateTime={e.em} title={e.em}>{dataHora(e.em)}</time>
          </li>
        ))}
      </ol>
      <p className="nota">A trilha é encadeada por hash: mexer em um evento quebra a corrente. O dossiê em PDF traz tudo, com IP e aparelho.</p>
    </section>
  )
}
