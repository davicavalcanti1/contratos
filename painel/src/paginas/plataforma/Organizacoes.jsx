// Organizações da plataforma. Cada uma é isolada: dados, contratos, usuários
// e chaves só dela. O developer cria e convida o primeiro administrador.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, Vazio, data, plural, useAcao, useDados } from '../../comum.jsx'

const MASCARA_CNPJ = (v) => v.replace(/\D/g, '').slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
const iniciais = (nome) => String(nome).split(' ').filter(p => /^[A-ZÀ-Ú0-9]/.test(p)).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '•'

export function Organizacoes() {
  const { dados, erro, carregando, recarregar } = useDados(() => api('/plataforma/organizacoes'), [])
  const [nova, setNova] = useState(false)
  const [criada, setCriada] = useState(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const todas = dados.organizacoes
  const lista = todas
    .filter(o => !filtro || (filtro === 'ativa' ? o.status === 'ativa' : filtro === 'suspensa' ? o.status !== 'ativa' : o.cadastro_incompleto.length > 0))
    .filter(o => !busca.trim() || o.nome.toLowerCase().includes(busca.trim().toLowerCase()) || (o.dados?.cnpj || '').includes(busca.trim()))
  const n = { '': todas.length, ativa: todas.filter(o => o.status === 'ativa').length, suspensa: todas.filter(o => o.status !== 'ativa').length, incompleta: todas.filter(o => o.cadastro_incompleto.length).length }

  return (
    <>
      <Cabecalho titulo="Organizações" sub={`${plural(todas.length, 'organização', 'organizações')}${n.suspensa ? ` · ${n.suspensa} ${n.suspensa === 1 ? 'suspensa' : 'suspensas'}` : ''}${n.incompleta ? ` · ${n.incompleta} com cadastro incompleto` : ''}. Cada uma é isolada: dados, contratos, usuários e chaves só dela.`}>
        {!nova && <button className="botao" onClick={() => setNova(true)}>Nova organização</button>}
      </Cabecalho>
      {criada && (
        <div className="aviso ok chave-nova" role="status">
          <p><strong>{criada.organizacao.nome} criada.</strong> Convite de administrador enviado para {criada.convite.email}, vale 7 dias. Se o e-mail não chegar, mande o link:</p>
          <p className="chave-valor"><code>{criada.convite.link}</code> <Copiar texto={criada.convite.link} /></p>
          <button className="link-botao" onClick={() => setCriada(null)}>Fechar</button>
        </div>
      )}
      {nova && <NovaOrganizacao planos={dados.planos} onCriada={(r) => { setNova(false); setCriada(r); recarregar() }} onCancelar={() => setNova(false)} />}

      <div className="barra-filtros">
        <label className="campo busca"><span className="sr">Buscar</span><input type="search" placeholder="Buscar por nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        <div className="chips" role="group" aria-label="Situação">
          {[['', 'Todas'], ['ativa', 'Ativas'], ['suspensa', 'Suspensas'], ['incompleta', 'Cadastro incompleto']].map(([v, r]) => (v && n[v] === 0 && filtro !== v) ? null : (
            <button key={v} type="button" className="chip" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{r}<b>{n[v]}</b></button>
          ))}
        </div>
      </div>

      <section className="cartao cartao-lista">
        {lista.length === 0 ? <Vazio>{todas.length ? 'Nenhuma organização neste filtro.' : 'Nenhuma organização ainda. Crie a primeira e convide o administrador.'}</Vazio> : (
          <ul className="lista-orgs">
            {lista.map(o => {
              const pct = o.consumo.limite ? Math.min(100, Math.round((o.consumo.usados / o.consumo.limite) * 100)) : null
              return (
                <li key={o.id} className={o.status === 'ativa' ? '' : 'inativo'}>
                  <span className="avatar org" aria-hidden="true">{iniciais(o.nome)}</span>
                  <div className="org-texto">
                    <Link to={`/plataforma/organizacoes/${o.id}`}>{o.nome}</Link>
                    <span>{o.dados?.cnpj ? `CNPJ ${o.dados.cnpj} · ` : ''}desde {data(o.criada_em)} · {plural(o.usuarios, 'usuário', 'usuários')}</span>
                    {o.cadastro_incompleto.length > 0 && <span className="erro-texto">cadastro incompleto: {o.cadastro_incompleto.join(', ')}</span>}
                  </div>
                  <div className="org-consumo">
                    <span><b>{o.consumo.usados}</b>{o.consumo.limite != null ? ` de ${o.consumo.limite}` : ''} este mês · plano {o.plano.nome}{o.plano.personalizado ? ' (limite próprio)' : ''}</span>
                    {pct != null && <div className="medidor"><i className={pct >= 90 ? 'alto' : ''} style={{ width: `${pct}%` }} /></div>}
                  </div>
                  <span className={`status ${o.status === 'ativa' ? 'assinado' : 'recusado'}`}>{o.status === 'ativa' ? 'Ativa' : 'Suspensa'}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <ConvidarDeveloper />
    </>
  )
}

function NovaOrganizacao({ planos, onCriada, onCancelar }) {
  const [f, setF] = useState({ razao_social: '', cnpj: '', plano: 'teste', admin_nome: '', admin_email: '' })
  const acao = useAcao()
  const set = (k) => (e) => setF(x => ({ ...x, [k]: k === 'cnpj' ? MASCARA_CNPJ(e.target.value) : e.target.value }))
  const criar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api('/plataforma/organizacoes', {
      metodo: 'POST',
      corpo: { dados: { razao_social: f.razao_social, cnpj: f.cnpj || undefined }, plano: f.plano, admin: { nome: f.admin_nome, email: f.admin_email } },
    }))
    if (r) onCriada(r)
  }
  return (
    <form className="cartao formulario" onSubmit={criar} noValidate>
      <fieldset className="form-secao">
        <legend><h2>Nova organização</h2><p>O administrador recebe um convite e completa o resto do cadastro: endereço, representante, encarregado de dados.</p></legend>
        <div className="campos">
          <Campo rotulo="Razão social" classe="c-6"><input value={f.razao_social} onChange={set('razao_social')} required /></Campo>
          <Campo rotulo="CNPJ" classe="c-3"><input value={f.cnpj} onChange={set('cnpj')} inputMode="numeric" placeholder="00.000.000/0000-00" /></Campo>
          <Campo rotulo="Plano" classe="c-3">
            <select value={f.plano} onChange={set('plano')}>{Object.entries(planos).map(([k, p]) => <option key={k} value={k}>{p.nome} · {p.contratos_mes == null ? 'sem limite' : `${p.contratos_mes}/mês`}</option>)}</select>
          </Campo>
        </div>
      </fieldset>
      <fieldset className="form-secao">
        <legend><h2>Primeiro administrador</h2></legend>
        <div className="campos">
          <Campo rotulo="Nome completo" classe="c-6"><input value={f.admin_nome} onChange={set('admin_nome')} required /></Campo>
          <Campo rotulo="E-mail" classe="c-6"><input type="email" value={f.admin_email} onChange={set('admin_email')} required /></Campo>
        </div>
      </fieldset>
      <div className="form-rodape">
        <Erro erro={acao.erro} onFechar={acao.limparErro} />
        <div className="acoes">
          <button className="botao" disabled={acao.ocupado || !f.razao_social.trim() || !f.admin_nome.trim() || !f.admin_email.trim()}>{acao.ocupado ? 'Criando…' : 'Criar e convidar'}</button>
          <button type="button" className="link-botao" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
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
    if (r) { setOk(r); setF({ nome: '', email: '' }) }
  }
  return (
    <details className="cartao detalhes-inativos">
      <summary>Convidar outra pessoa para administrar a plataforma</summary>
      <form onSubmit={enviar} className="estreito-esq" noValidate>
        <p className="nota">Developer vê todas as organizações, pode suspendê-las e abri-las como suporte. Convide só quem opera a plataforma.</p>
        <Erro erro={acao.erro} onFechar={acao.limparErro} />
        {ok && <div className="aviso ok chave-nova"><p>Convite enviado para {ok.email}.</p><p className="chave-valor"><code>{ok.link}</code> <Copiar texto={ok.link} /></p></div>}
        <div className="campos">
          <Campo rotulo="Nome completo" classe="c-6"><input value={f.nome} onChange={e => setF(x => ({ ...x, nome: e.target.value }))} required /></Campo>
          <Campo rotulo="E-mail" classe="c-6"><input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} required /></Campo>
        </div>
        <div className="acoes"><button className="botao secundario" disabled={acao.ocupado || !f.nome.trim() || !f.email.trim()}>Enviar convite</button></div>
      </form>
    </details>
  )
}
