import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, Vazio, data, useAcao, useDados } from '../../comum.jsx'

export function Organizacoes() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/plataforma/organizacoes'), [])
  const [nova, setNova] = useState(false)
  const [convite, setConvite] = useState(null)

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  return (
    <>
      <Cabecalho titulo="Organizações" sub="Cada uma é isolada: dados, contratos, usuários e chaves só dela.">
        {!nova && <button className="botao" onClick={() => setNova(true)}>Nova organização</button>}
      </Cabecalho>
      {convite && <p className="aviso ok">Organização criada e convite enviado para {convite.email}. <button className="link-botao" onClick={() => setConvite(null)}>Fechar</button></p>}
      {nova && <NovaOrganizacao planos={dados.planos} onCriada={(r) => { setNova(false); setConvite(r.convite); recarregar() }} onCancelar={() => setNova(false)} />}
      <section className="cartao">
        {dados.organizacoes.length === 0 ? <Vazio>Nenhuma organização ainda.</Vazio> : (
          <div className="rolagem">
            <table className="tabela">
              <thead><tr><th>Organização</th><th>Plano</th><th>Contratos no mês</th><th>Usuários</th><th>Situação</th></tr></thead>
              <tbody>{dados.organizacoes.map(o => (
                <tr key={o.id} className={o.status === 'ativa' ? '' : 'inativo'}>
                  <td><Link to={`/plataforma/organizacoes/${o.id}`}>{o.nome}</Link><br /><small>desde {data(o.criada_em)}</small></td>
                  <td>{o.plano.nome}{o.plano.personalizado && <small> (limite próprio)</small>}</td>
                  <td>{o.consumo.limite == null ? o.consumo.usados : `${o.consumo.usados} de ${o.consumo.limite}`}</td>
                  <td>{o.usuarios}</td>
                  <td>{o.status === 'ativa' ? 'ativa' : 'suspensa'}{o.cadastro_incompleto.length > 0 && <><br /><small className="erro-texto">cadastro incompleto</small></>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <ConvidarDeveloper />
    </>
  )
}

function NovaOrganizacao({ planos, onCriada, onCancelar }) {
  const [f, setF] = useState({ razao_social: '', cnpj: '', plano: 'teste', admin_nome: '', admin_email: '' })
  const acao = useAcao()
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/plataforma/organizacoes', {
      metodo: 'POST',
      corpo: { dados: { razao_social: f.razao_social, cnpj: f.cnpj || undefined }, plano: f.plano, admin: { nome: f.admin_nome, email: f.admin_email } },
    }))
    if (r) onCriada(r)
  }
  return (
    <form className="cartao" onSubmit={criar}>
      <h2>Nova organização</h2>
      <p className="nota">O administrador recebe um convite e completa o resto do cadastro (endereço, representante, encarregado de dados).</p>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      <div className="grade-campos">
        <Campo rotulo="Razão social" obrigatorio><input value={f.razao_social} onChange={set('razao_social')} required /></Campo>
        <Campo rotulo="CNPJ"><input value={f.cnpj} onChange={set('cnpj')} inputMode="numeric" /></Campo>
        <Campo rotulo="Plano">
          <select value={f.plano} onChange={set('plano')}>{Object.entries(planos).map(([k, p]) => <option key={k} value={k}>{p.nome} ({p.contratos_mes == null ? 'sem limite' : `${p.contratos_mes} contratos/mês`})</option>)}</select>
        </Campo>
        <Campo rotulo="Administrador: nome completo" obrigatorio><input value={f.admin_nome} onChange={set('admin_nome')} required /></Campo>
        <Campo rotulo="Administrador: e-mail" obrigatorio><input type="email" value={f.admin_email} onChange={set('admin_email')} required /></Campo>
      </div>
      <div className="acoes"><button className="botao" disabled={acao.ocupado}>Criar e convidar</button><button type="button" className="link-botao" onClick={onCancelar}>Cancelar</button></div>
    </form>
  )
}

function ConvidarDeveloper() {
  const [f, setF] = useState({ nome: '', email: '' })
  const [ok, setOk] = useState(null)
  const acao = useAcao()
  const enviar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/plataforma/developers', { metodo: 'POST', corpo: f }))
    if (r) { setOk(r.email); setF({ nome: '', email: '' }) }
  }
  return (
    <details className="cartao">
      <summary>Convidar outra pessoa para administrar a plataforma</summary>
      <form onSubmit={enviar} className="estreito-esq">
        <p className="nota">Developer vê todas as organizações e pode suspendê-las. Convide só quem opera a plataforma.</p>
        <Erro erro={acao.erro} onFechar={acao.limparErro} />
        {ok && <p className="aviso ok">Convite enviado para {ok}.</p>}
        <Campo rotulo="Nome completo"><input value={f.nome} onChange={e => setF(x => ({ ...x, nome: e.target.value }))} required /></Campo>
        <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} required /></Campo>
        <button className="botao secundario" disabled={acao.ocupado}>Enviar convite</button>
      </form>
    </details>
  )
}
