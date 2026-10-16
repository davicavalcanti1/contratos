import { useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, Vazio, dataHora, useAcao, useDados } from '../../comum.jsx'

export function Chaves() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/admin/chaves'), [])
  const acao = useAcao()
  const [nova, setNova] = useState({ nome: '', escopo: 'escrita' })
  const [criada, setCriada] = useState(null)

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/admin/chaves', { metodo: 'POST', corpo: nova }))
    if (r) { setCriada(r); setNova({ nome: '', escopo: 'escrita' }); recarregar() }
  }
  const revogar = (c) => {
    if (!window.confirm(`Revogar "${c.nome}"? Os sistemas que usam esta chave param de funcionar na hora.`)) return
    acao.executar(async () => { await api(`/admin/chaves/${c.id}`, { metodo: 'DELETE' }); recarregar() })
  }
  const origem = window.location.origin

  return (
    <>
      <Cabecalho titulo="Chaves de API" sub="Para outro sistema (o seu ERP, o ExameQR…) gerar e consultar contratos sem passar pelo painel." />
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {criada && (
        <div className="aviso ok chave-nova" role="status">
          <p><strong>Chave "{criada.nome}" criada.</strong> Copie agora: ela não aparece de novo. Só guardamos uma impressão dela, não a chave.</p>
          <p className="chave-valor"><code>{criada.chave}</code> <Copiar texto={criada.chave} /></p>
          <button className="link-botao" onClick={() => setCriada(null)}>Já copiei</button>
        </div>
      )}
      <div className="duas-colunas largas">
        <section className="cartao">
          {dados.length === 0 ? <Vazio>Nenhuma chave ainda.</Vazio> : (
            <table className="tabela">
              <thead><tr><th>Nome</th><th>Acesso</th><th>Começa com</th><th>Último uso</th><th></th></tr></thead>
              <tbody>{dados.map(c => (
                <tr key={c.id} className={c.revogada_em ? 'inativo' : ''}>
                  <td>{c.nome}<br /><small>criada {dataHora(c.criada_em)}</small></td>
                  <td>{c.escopo === 'escrita' ? 'gera e consulta' : 'só consulta'}</td>
                  <td><code>{c.prefixo}…</code></td>
                  <td>{c.revogada_em ? `revogada ${dataHora(c.revogada_em)}` : c.usada_em ? dataHora(c.usada_em) : 'nunca'}</td>
                  <td>{!c.revogada_em && <button className="link-botao perigo" onClick={() => revogar(c)}>Revogar</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <details className="exemplo-api">
            <summary>Como usar</summary>
            <pre>{`curl ${origem}/v1/contratos \\
  -H "Authorization: Bearer cs_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "modelo": "prestacao_servicos", "referencia": "pedido-123", "dados": { ... } }'`}</pre>
            <p>Depois, <code>POST /v1/contratos/:id/enviar</code> com os signatários. A lista completa de rotas está na documentação do produto.</p>
          </details>
        </section>
        <form className="cartao" onSubmit={criar}>
          <h2>Nova chave</h2>
          <Campo rotulo="Nome" dica="Para saber depois quem usa: o nome do sistema."><input value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} required placeholder="Integração ExameQR" /></Campo>
          <fieldset className="opcoes-papel">
            <legend>Acesso</legend>
            <label className="check"><input type="radio" name="escopo" checked={nova.escopo === 'escrita'} onChange={() => setNova(n => ({ ...n, escopo: 'escrita' }))} /><span><strong>Gera e consulta</strong>: cria, envia e cancela contratos</span></label>
            <label className="check"><input type="radio" name="escopo" checked={nova.escopo === 'leitura'} onChange={() => setNova(n => ({ ...n, escopo: 'leitura' }))} /><span><strong>Só consulta</strong>: para relatórios e BI</span></label>
          </fieldset>
          <button className="botao" disabled={acao.ocupado}>Criar chave</button>
        </form>
      </div>
    </>
  )
}
