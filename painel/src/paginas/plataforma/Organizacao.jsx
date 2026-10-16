import { Fragment, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, dataHora, endereco, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { PAPEIS_ORG } from '../org/Usuarios.jsx'

export function Organizacao() {
  const { id } = useParams()
  const { abrirSuporte } = useSessao()
  const navegar = useNavigate()
  const planos = useDados(() => api('/plataforma/organizacoes').then(r => ({ planos: r.planos, campos: r.campos })), [])
  const { dados: o, erro, carregando, recarregar } = useDados(() => api(`/plataforma/organizacoes/${id}`), [id])
  const acao = useAcao()
  const [limite, setLimite] = useState('')
  const [convite, setConvite] = useState({ nome: '', email: '', papel: 'org_admin' })
  const [aviso, setAviso] = useState(null)

  if ((carregando && !o) || planos.carregando) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const patch = (corpo, msg) => acao.executar(async () => { await api(`/plataforma/organizacoes/${id}`, { metodo: 'PATCH', corpo }); setAviso(msg); recarregar() })
  const suspender = () => {
    const vai = o.status === 'ativa'
    if (vai && !window.confirm(`Suspender ${o.nome}? Ninguém de lá gera nem envia contrato até reativar. Quem já recebeu link continua conseguindo assinar.`)) return
    patch({ status: vai ? 'suspensa' : 'ativa' }, vai ? 'Organização suspensa.' : 'Organização reativada.')
  }
  const convidar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api(`/plataforma/organizacoes/${id}/usuarios`, { metodo: 'POST', corpo: convite }))
    if (r) { setAviso(`Convite enviado para ${r.email}.`); setConvite({ nome: '', email: '', papel: 'org_admin' }); recarregar() }
  }
  const c = o.consumo

  return (
    <>
      <Cabecalho titulo={o.nome} sub={`${o.status === 'ativa' ? 'Ativa' : 'Suspensa'}, desde ${dataHora(o.criada_em)}. ${c.limite == null ? c.usados : `${c.usados} de ${c.limite}`} contratos este mês.`}>
        <button className="botao" onClick={() => { abrirSuporte({ id: o.id, nome: o.nome }); navegar('/inicio') }}>Abrir como suporte (só leitura)</button>
        <button className={`botao ${o.status === 'ativa' ? 'perigo' : 'secundario'}`} onClick={suspender}>{o.status === 'ativa' ? 'Suspender' : 'Reativar'}</button>
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && <p className="aviso ok">{aviso}</p>}
      {o.cadastro_incompleto.length > 0 && <p className="aviso erro">Cadastro incompleto: {o.cadastro_incompleto.join(', ')}. Ela não consegue gerar contratos até completar.</p>}

      <div className="duas-colunas">
        <section className="cartao">
          <h2>Plano</h2>
          <Campo rotulo="Plano">
            <select value={o.plano.chave} onChange={e => patch({ plano: e.target.value }, 'Plano alterado.')}>
              {Object.entries(planos.dados.planos).map(([k, p]) => <option key={k} value={k}>{p.nome} ({p.contratos_mes == null ? 'sem limite' : `${p.contratos_mes}/mês`})</option>)}
            </select>
          </Campo>
          <form className="linha-form" onSubmit={e => { e.preventDefault(); patch({ limite_contratos_mes: limite === '' ? null : Number(limite) }, 'Limite alterado.'); setLimite('') }}>
            <Campo rotulo="Limite próprio (contratos/mês)" dica={`Hoje: ${o.plano.contratos_mes ?? 'sem limite'}. Em branco = sem limite.`}><input inputMode="numeric" value={limite} onChange={e => setLimite(e.target.value.replace(/\D/g, ''))} /></Campo>
            <button className="botao secundario">Aplicar</button>
          </form>

          <h2>Dados cadastrados</h2>
          <dl className="dados">
            {planos.dados.campos.map(c => <Fragment key={c.chave}><dt>{c.rotulo}</dt><dd>{c.tipo === 'endereco' ? endereco(o.dados?.[c.chave]) : o.dados?.[c.chave] || <span className="erro-texto">não preenchido</span>}</dd></Fragment>)}
          </dl>
        </section>

        <section className="cartao">
          <h2>Usuários</h2>
          <table className="tabela">
            <tbody>
              {o.usuarios.map(u => <tr key={u.id} className={u.ativo ? '' : 'inativo'}><td>{u.nome}<br /><small>{u.email}</small></td><td>{u.papel_rotulo}</td><td><small>{u.ativo ? `acesso ${dataHora(u.ultimo_acesso_em)}` : 'desativado'}</small></td></tr>)}
              {o.convites.map(cv => <tr key={cv.email} className="pendente"><td>{cv.nome}<br /><small>{cv.email}</small></td><td>{cv.papel_rotulo}</td><td><small>convite pendente</small></td></tr>)}
            </tbody>
          </table>
          <form onSubmit={convidar}>
            <h3>Convidar usuário</h3>
            <div className="grade-campos">
              <Campo rotulo="Nome completo"><input value={convite.nome} onChange={e => setConvite(x => ({ ...x, nome: e.target.value }))} required /></Campo>
              <Campo rotulo="E-mail"><input type="email" value={convite.email} onChange={e => setConvite(x => ({ ...x, email: e.target.value }))} required /></Campo>
              <Campo rotulo="Papel"><select value={convite.papel} onChange={e => setConvite(x => ({ ...x, papel: e.target.value }))}>{PAPEIS_ORG.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
            </div>
            <button className="botao secundario" disabled={acao.ocupado}>Enviar convite</button>
          </form>

          <h2>Integrações</h2>
          <p>{o.chaves.filter(k => !k.revogada_em).length} chave(s) de API ativa(s); {o.webhooks.length} webhook(s){o.webhooks.some(w => w.falhas) ? <>, <span className="erro-texto">com entregas falhando</span></> : ''}.</p>
        </section>
      </div>

      <section className="cartao">
        <h2>Auditoria recente</h2>
        <TabelaAuditoria itens={o.auditoria} />
      </section>
    </>
  )
}

export function TabelaAuditoria({ itens, comOrganizacao = false }) {
  return (
    <div className="rolagem">
      <table className="tabela">
        <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th>{comOrganizacao && <th>Organização</th>}<th>Detalhe</th></tr></thead>
        <tbody>{itens.map(a => (
          <tr key={a.id}>
            <td>{dataHora(a.em)}</td>
            <td>{a.ator?.email || a.ator?.tipo}</td>
            <td><code>{a.acao}</code></td>
            {comOrganizacao && <td><small>{a.organizacao_id || '—'}</small></td>}
            <td><small>{[a.alvo, ...Object.entries(a.dados || {}).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)].filter(Boolean).join(' · ')}</small></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}
