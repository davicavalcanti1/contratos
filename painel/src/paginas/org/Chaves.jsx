// Chaves de API: para outro sistema gerar e consultar contratos sem o painel.
// A chave aparece uma vez, na criação; depois só o prefixo.

import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, Vazio, dataHora, plural, useAcao, useDados } from '../../comum.jsx'

export function Chaves() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/admin/chaves'), [])
  const acao = useAcao()
  const [nova, setNova] = useState({ nome: '', escopo: 'escrita' })
  const [criada, setCriada] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [verRevogadas, setVerRevogadas] = useState(false)

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/chaves', { metodo: 'POST', corpo: nova }))
    if (r) { setCriada(r); setNova({ nome: '', escopo: 'escrita' }); recarregar() }
  }
  const revogar = (c) => acao.executar(async () => { await api(`/admin/chaves/${c.id}`, { metodo: 'DELETE' }); setConfirmar(null); recarregar() })
  const origem = window.location.origin
  const ativas = dados.filter(c => !c.revogada_em)
  const revogadas = dados.filter(c => c.revogada_em)

  return (
    <>
      <Cabecalho titulo="Chaves de API" sub="Para o seu ERP, o seu sistema de RH ou outro SaaS gerar e consultar contratos sem passar pelo painel." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {criada && (
        <div className="aviso ok chave-nova" role="status">
          <p><strong>Chave "{criada.nome}" criada.</strong> Copie agora: ela não aparece de novo. Guardamos só uma impressão dela, não a chave.</p>
          <p className="chave-valor"><code>{criada.chave}</code> <Copiar texto={criada.chave} /></p>
          <button className="link-botao" onClick={() => setCriada(null)}>Já copiei</button>
        </div>
      )}
      <div className="duas-colunas largas">
        <div className="coluna">
          <section className="cartao">
            <div className="cartao-topo"><h2>{ativas.length ? plural(ativas.length, 'chave ativa', 'chaves ativas') : 'Chaves'}</h2>{revogadas.length > 0 && <button type="button" className="link-botao pequeno-link" onClick={() => setVerRevogadas(v => !v)}>{verRevogadas ? 'Esconder revogadas' : `Ver ${plural(revogadas.length, 'revogada', 'revogadas')}`}</button>}</div>
            {ativas.length === 0 && !verRevogadas ? <Vazio>Nenhuma chave ainda. Crie uma ao lado e cole no sistema que vai integrar.</Vazio> : (
              <ul className="lista-chaves">
                {[...ativas, ...(verRevogadas ? revogadas : [])].map(c => (
                  <li key={c.id} className={c.revogada_em ? 'inativo' : ''}>
                    <div className="chave-texto">
                      <strong>{c.nome}</strong>
                      <span><code>{c.prefixo}…</code> · criada {dataHora(c.criada_em)}</span>
                      <span>{c.revogada_em ? `revogada ${dataHora(c.revogada_em)}` : c.usada_em ? `último uso ${dataHora(c.usada_em)}` : 'nunca usada'}</span>
                    </div>
                    <div className="pessoa-estado">
                      <span className={`status ${c.escopo === 'escrita' ? 'enviado' : 'encerrado'}`}>{c.escopo === 'escrita' ? 'Gera e consulta' : 'Só consulta'}</span>
                      {!c.revogada_em && (confirmar === c.id
                        ? <span className="confirmar">Os sistemas que a usam param na hora. <button className="link-botao perigo" onClick={() => revogar(c)}>Revogar</button> <button className="link-botao" onClick={() => setConfirmar(null)}>Cancelar</button></span>
                        : <button className="link-botao pequeno-link perigo" onClick={() => setConfirmar(c.id)}>Revogar</button>)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="cartao">
            <h2>Como usar</h2>
            <p className="nota">Mande a chave no cabeçalho <code>Authorization: Bearer</code>. As rotas de <code>/v1</code> são as mesmas que o painel usa.</p>
            <pre className="codigo-exemplo">{`curl ${origem}/v1/contratos \\
  -H "Authorization: Bearer cs_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "modelo": "prestacao_servicos", "referencia": "pedido-123",
        "dados": { "contratado": { ... }, "contrato": { ... } } }'`}</pre>
            <ol className="passos-inicio compacto">
              <li><strong>Gere</strong><span><code>POST /v1/contratos</code> com o modelo e os dados. A <code>referencia</code> é o id no seu sistema e volta em toda consulta e webhook.</span></li>
              <li><strong>Envie</strong><span><code>POST /v1/contratos/:id/enviar</code> com os signatários. Cada pessoa recebe o link por e-mail.</span></li>
              <li><strong>Acompanhe</strong><span><code>GET /v1/contratos/:id</code> traz situação, assinaturas e eventos; os webhooks avisam sem você perguntar.</span></li>
            </ol>
          </section>
        </div>

        <form className="cartao" onSubmit={criar}>
          <h2>Nova chave</h2>
          <div className="campos">
            <Campo rotulo="Nome" classe="c-12" dica="Para saber depois quem usa: o nome do sistema."><input value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} required placeholder="Integração ExameQR" /></Campo>
          </div>
          <fieldset className="opcoes-papel">
            <legend>Acesso</legend>
            <label className={`opcao-cartao${nova.escopo === 'escrita' ? ' marcada' : ''}`}><input type="radio" name="escopo" checked={nova.escopo === 'escrita'} onChange={() => setNova(n => ({ ...n, escopo: 'escrita' }))} /><span><strong>Gera e consulta</strong><small>cria, envia e cancela contratos</small></span></label>
            <label className={`opcao-cartao${nova.escopo === 'leitura' ? ' marcada' : ''}`}><input type="radio" name="escopo" checked={nova.escopo === 'leitura'} onChange={() => setNova(n => ({ ...n, escopo: 'leitura' }))} /><span><strong>Só consulta</strong><small>para relatórios e BI</small></span></label>
          </fieldset>
          <button className="botao largo" disabled={acao.ocupado || !nova.nome.trim()}>{acao.ocupado ? 'Criando…' : 'Criar chave'}</button>
          <p className="nota">A chave só aparece uma vez. Guarde-a num cofre de segredos, não no código.</p>
        </form>
      </div>
    </>
  )
}
