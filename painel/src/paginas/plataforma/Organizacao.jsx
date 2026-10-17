// Uma organização vista pela plataforma: plano e limite, cadastro, pessoas,
// integrações e auditoria. Dá para abrir como suporte (só leitura) e suspender.

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Copiar, Erro, data, dataHora, endereco, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'
import { PAPEIS_ORG } from '../org/Usuarios.jsx'
import { ListaAuditoria } from './Auditoria.jsx'

const iniciais = (nome) => String(nome).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export function Organizacao() {
  const { id } = useParams()
  const { abrirSuporte } = useSessao()
  const navegar = useNavigate()
  const base = useDados(() => api('/plataforma/organizacoes').then(r => ({ planos: r.planos, campos: r.campos })), [])
  const { dados: o, erro, carregando, recarregar } = useDados(() => api(`/plataforma/organizacoes/${id}`), [id])
  const acao = useAcao()
  const [limite, setLimite] = useState('')
  const [convite, setConvite] = useState({ nome: '', email: '', papel: 'org_admin' })
  const [aviso, setAviso] = useState(null)
  const [confirmarSuspensao, setConfirmarSuspensao] = useState(false)

  if ((carregando && !o) || base.carregando) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const patch = (corpo, msg) => acao.executar(async () => { await api(`/plataforma/organizacoes/${id}`, { metodo: 'PATCH', corpo }); setAviso(msg); setConfirmarSuspensao(false); recarregar() })
  const convidar = async (e) => {
    e.preventDefault()
    const r = await acao.executar(() => api(`/plataforma/organizacoes/${id}/usuarios`, { metodo: 'POST', corpo: convite }))
    if (r) { setAviso({ texto: `Convite enviado para ${r.email}.`, link: r.link }); setConvite({ nome: '', email: '', papel: 'org_admin' }); recarregar() }
  }
  const c = o.consumo
  const ativa = o.status === 'ativa'
  const pct = c.limite ? Math.min(100, Math.round((c.usados / c.limite) * 100)) : null
  const chavesAtivas = o.chaves.filter(k => !k.revogada_em).length
  const webhooksFalhando = o.webhooks.filter(w => w.falhas).length

  return (
    <>
      <p className="trilha-pagina"><Link to="/plataforma">Organizações</Link> <span>/</span> {o.nome}</p>
      <Cabecalho titulo={o.nome} sub={<span className="detalhe-sub">
        <span className={`status ${ativa ? 'assinado' : 'recusado'}`}>{ativa ? 'Ativa' : 'Suspensa'}</span>
        {o.dados?.cnpj && <span>CNPJ {o.dados.cnpj}</span>}
        <span>desde {data(o.criada_em)}</span>
        <span>{c.limite == null ? c.usados : `${c.usados} de ${c.limite}`} contratos este mês</span>
      </span>}>
        <button className="botao" onClick={() => { abrirSuporte({ id: o.id, nome: o.nome }); navegar('/inicio') }}>Abrir como suporte</button>
        {confirmarSuspensao
          ? <span className="confirmar">Ninguém de lá gera nem envia até reativar; quem já tem link ainda assina. <button className="link-botao perigo" onClick={() => patch({ status: 'suspensa' }, 'Organização suspensa.')}>Suspender</button> <button className="link-botao" onClick={() => setConfirmarSuspensao(false)}>Cancelar</button></span>
          : ativa
            ? <button className="botao secundario perigo-borda" onClick={() => setConfirmarSuspensao(true)}>Suspender</button>
            : <button className="botao secundario" onClick={() => patch({ status: 'ativa' }, 'Organização reativada.')}>Reativar</button>}
      </Cabecalho>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      {aviso && (
        <div className="aviso ok chave-nova" role="status">
          <p>{typeof aviso === 'string' ? aviso : aviso.texto}</p>
          {aviso.link && <p className="chave-valor"><code>{aviso.link}</code> <Copiar texto={aviso.link} /></p>}
          <button className="link-botao" onClick={() => setAviso(null)}>Fechar</button>
        </div>
      )}
      {o.cadastro_incompleto.length > 0 && <div className="aviso erro" role="alert"><strong>Cadastro incompleto:</strong> {o.cadastro_incompleto.join(', ')}. A organização não gera contratos até o administrador completar em "Dados da empresa".</div>}

      <div className="duas-colunas largas">
        <div className="coluna">
          <section className="cartao">
            <div className="cartao-topo"><h2>Plano e limite</h2><span className="nota">definidos pela plataforma</span></div>
            <div className="campos">
              <Campo rotulo="Plano" classe="c-6">
                <select value={o.plano.chave} onChange={e => patch({ plano: e.target.value }, 'Plano alterado.')}>
                  {Object.entries(base.dados.planos).map(([k, p]) => <option key={k} value={k}>{p.nome} · {p.contratos_mes == null ? 'sem limite' : `${p.contratos_mes}/mês`}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Limite próprio (contratos/mês)" classe="c-6" dica={`Hoje: ${o.plano.contratos_mes ?? 'sem limite'}${o.plano.personalizado ? ', definido à mão' : ', do plano'}. Em branco = sem limite.`}>
                <div className="campo-com-botao">
                  <input inputMode="numeric" value={limite} placeholder={o.plano.contratos_mes ?? '∞'} onChange={e => setLimite(e.target.value.replace(/\D/g, ''))} />
                  <button type="button" className="botao secundario pequeno" disabled={acao.ocupado} onClick={() => { patch({ limite_contratos_mes: limite === '' ? null : Number(limite) }, 'Limite alterado.'); setLimite('') }}>Aplicar</button>
                </div>
              </Campo>
            </div>
            <div className="consumo-linha">
              <span><b>{c.usados}</b>{c.limite != null ? ` de ${c.limite}` : ''} contratos este mês{c.limite != null && c.restantes != null ? ` · restam ${c.restantes}` : ''}</span>
              {pct != null && <div className="medidor"><i className={pct >= 90 ? 'alto' : ''} style={{ width: `${pct}%` }} /></div>}
            </div>
          </section>

          <section className="cartao">
            <div className="cartao-topo"><h2>Pessoas</h2><span className="nota">{plural(o.usuarios.filter(u => u.ativo).length, 'ativa', 'ativas')}{o.convites.length ? ` · ${plural(o.convites.length, 'convite pendente', 'convites pendentes')}` : ''}</span></div>
            <ul className="pessoas">
              {o.usuarios.map(u => (
                <li key={u.id} className={`pessoa${u.ativo ? '' : ' inativo'}`}>
                  <span className="avatar" aria-hidden="true">{iniciais(u.nome)}</span>
                  <div className="pessoa-texto"><strong>{u.nome}</strong><span>{u.email}</span><span>{u.ativo ? (u.ultimo_acesso_em ? `último acesso ${dataHora(u.ultimo_acesso_em)}` : 'ainda não entrou') : 'desativado'}</span></div>
                  <div className="pessoa-estado"><span className={`status ${u.ativo ? 'enviado' : 'encerrado'}`}>{u.papel_rotulo}</span></div>
                </li>
              ))}
              {o.convites.map(cv => (
                <li key={cv.email} className="pessoa pendente">
                  <span className="avatar" aria-hidden="true">{iniciais(cv.nome)}</span>
                  <div className="pessoa-texto"><strong>{cv.nome}</strong><span>{cv.email}</span><span>convite vale até {dataHora(cv.expira_em)}</span></div>
                  <div className="pessoa-estado"><span className="status gerado">Convite pendente</span><small>{cv.papel_rotulo}</small></div>
                </li>
              ))}
            </ul>
            <form onSubmit={convidar} className="form-embutido" noValidate>
              <h3>Convidar alguém para esta organização</h3>
              <div className="campos">
                <Campo rotulo="Nome completo" classe="c-5"><input value={convite.nome} onChange={e => setConvite(x => ({ ...x, nome: e.target.value }))} required /></Campo>
                <Campo rotulo="E-mail" classe="c-4"><input type="email" value={convite.email} onChange={e => setConvite(x => ({ ...x, email: e.target.value }))} required /></Campo>
                <Campo rotulo="Papel" classe="c-3"><select value={convite.papel} onChange={e => setConvite(x => ({ ...x, papel: e.target.value }))}>{PAPEIS_ORG.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
              </div>
              <div className="acoes"><button className="botao secundario" disabled={acao.ocupado || !convite.nome.trim() || !convite.email.trim()}>Enviar convite</button></div>
            </form>
          </section>

          <section className="cartao">
            <h2>Auditoria recente</h2>
            <ListaAuditoria itens={o.auditoria} />
          </section>
        </div>

        <div className="coluna">
          <section className="cartao">
            <h2>Cadastro</h2>
            <dl className="dados-lista">
              {base.dados.campos.map(cp => {
                const v = cp.tipo === 'endereco' ? endereco(o.dados?.[cp.chave]) : o.dados?.[cp.chave]
                return <div key={cp.chave}><dt>{cp.rotulo}</dt><dd>{v || <span className="erro-texto">não preenchido</span>}</dd></div>
              })}
            </dl>
            <p className="nota">Quem edita é o administrador da organização, em "Dados da empresa".</p>
          </section>

          <section className="cartao">
            <h2>Integrações</h2>
            <dl className="dados-lista">
              <div><dt>Chaves de API</dt><dd>{chavesAtivas ? plural(chavesAtivas, 'ativa', 'ativas') : 'nenhuma ativa'}{o.chaves.length > chavesAtivas ? ` · ${o.chaves.length - chavesAtivas} revogada(s)` : ''}</dd></div>
              <div><dt>Webhooks</dt><dd>{o.webhooks.length ? `${o.webhooks.length} cadastrado(s)` : 'nenhum'}{webhooksFalhando ? <> · <span className="erro-texto">{plural(webhooksFalhando, 'com entregas falhando', 'com entregas falhando')}</span></> : ''}</dd></div>
            </dl>
            {o.webhooks.length > 0 && (
              <ul className="lista-webhooks compacta">
                {o.webhooks.map(w => <li key={w.id} className={w.ativo ? '' : 'inativo'}><div className="webhook-texto"><span className="url">{w.url}</span>{w.falhas > 0 && <span className="erro-texto">{plural(w.falhas, 'entrega falhou', 'entregas falharam')}</span>}</div><span className={`status ${w.ativo ? 'assinado' : 'encerrado'}`}>{w.ativo ? 'Ativo' : 'Pausado'}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
