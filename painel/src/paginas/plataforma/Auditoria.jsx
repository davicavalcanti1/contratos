// Auditoria da plataforma: quem fez o quê, em todas as organizações. O
// registro é só de acréscimo. Aqui cada ação vira uma frase e dá para
// filtrar por tipo.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, Vazio, dataHora, plural, useDados } from '../../comum.jsx'

// Como cada ação é contada. `d` são os dados do registro, `alvo` o alvo.
const ACAO = {
  'login': () => 'entrou no painel',
  'login.falhou': () => 'errou a senha',
  'senha.redefinicao_pedida': (d) => d.conta === false ? 'pediu redefinição de senha para um e-mail sem conta' : 'pediu redefinição de senha',
  'usuario.senha_redefinida': () => 'redefiniu a senha pelo link',
  'usuario.senha_trocada': () => 'trocou a própria senha',
  'usuario.convidado': (d) => `convidou ${d.email || 'alguém'}${d.papel ? ` como ${PAPEL[d.papel] || d.papel}` : ''}`,
  'usuario.ativado': () => 'aceitou o convite e criou a senha',
  'usuario.alterado': (d, alvo) => `alterou ${alvo || 'um usuário'}${d.campos ? ` (${d.campos.join(', ')})` : ''}`,
  'organizacao.criada': (d) => `criou a organização ${d.nome || ''}${d.plano ? `, plano ${d.plano}` : ''}`,
  'organizacao.atualizada': (d) => `alterou a organização${d.status ? ` (${d.status})` : d.plano ? ` (plano ${d.plano})` : d.campos ? ` (${d.campos.join(', ')})` : ''}`,
  'chave.criada': (d, alvo) => `criou a chave de API ${alvo || d.nome || ''}`,
  'chave.revogada': (d, alvo) => `revogou a chave de API ${alvo || ''}`,
  'webhook.criado': (d, alvo) => `cadastrou o webhook ${alvo || d.url || ''}`,
  'webhook.alterado': (d, alvo) => `alterou o webhook ${alvo || ''}`,
  'webhook.removido': (d, alvo) => `removeu o webhook ${alvo || ''}`,
  'webhook.segredo_visto': (d, alvo) => `viu o segredo do webhook ${alvo || ''}`,
  'suporte.consulta': (d) => `consultou ${d.rota === '/contratos' ? 'os contratos' : d.rota === '/lotes' ? 'os lotes' : 'dados'} como suporte`,
}
const PAPEL = { org_admin: 'administrador', emissor: 'emissor', leitor: 'leitor', developer: 'developer' }
const GRUPOS = [
  ['', 'Tudo'],
  ['acesso', 'Acessos'],
  ['usuarios', 'Usuários'],
  ['organizacoes', 'Organizações'],
  ['integracoes', 'Integrações'],
  ['suporte', 'Suporte'],
]
const grupoDe = (acao) => acao.startsWith('login') || acao.startsWith('senha') || acao.includes('senha') ? 'acesso'
  : acao.startsWith('usuario') ? 'usuarios' : acao.startsWith('organizacao') ? 'organizacoes'
  : acao.startsWith('chave') || acao.startsWith('webhook') ? 'integracoes' : acao.startsWith('suporte') ? 'suporte' : ''
const ALERTA = new Set(['login.falhou', 'chave.revogada', 'webhook.removido', 'webhook.segredo_visto'])

export function Auditoria() {
  const { dados, erro, carregando } = useDados(async () => {
    const [itens, orgs] = await Promise.all([api('/plataforma/auditoria'), api('/plataforma/organizacoes').catch(() => ({ organizacoes: [] }))])
    return { itens, orgs: Object.fromEntries(orgs.organizacoes.map(x => [x.id, x.nome])) }
  }, [])
  const [grupo, setGrupo] = useState('')
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  const { itens, orgs } = dados
  const contagem = Object.fromEntries(GRUPOS.map(([g]) => [g, g ? itens.filter(a => grupoDe(a.acao) === g).length : itens.length]))
  return (
    <>
      <Cabecalho titulo="Auditoria" sub={`${plural(itens.length, 'registro recente', 'registros recentes')}, em todas as organizações. O registro é só de acréscimo: nada aqui é editado nem apagado.`} />
      <div className="chips chips-lote" role="group" aria-label="Tipo">
        {GRUPOS.map(([g, r]) => (g && contagem[g] === 0 && grupo !== g) ? null : <button key={g} type="button" className="chip" aria-pressed={grupo === g} onClick={() => setGrupo(g)}>{r}<b>{contagem[g]}</b></button>)}
      </div>
      <section className="cartao cartao-lista">
        <ListaAuditoria itens={itens.filter(a => !grupo || grupoDe(a.acao) === grupo)} comOrganizacao orgs={orgs} />
      </section>
    </>
  )
}

const iniciais = (s) => String(s || '?').split(/[@\s]/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

// Entradas iguais em sequência (o mesmo login várias vezes) viram uma só, com contagem.
function agrupar(itens) {
  const saida = []
  for (const a of itens) {
    const ult = saida.at(-1)
    if (ult && ult.acao === a.acao && (ult.ator?.email || ult.ator?.tipo) === (a.ator?.email || a.ator?.tipo) && ult.organizacao_id === a.organizacao_id && ['login', 'login.falhou', 'suporte.consulta'].includes(a.acao)) {
      ult.vezes++; ult.ate = a.em; continue
    }
    saida.push({ ...a, vezes: 1, ate: a.em })
  }
  return saida
}

export function ListaAuditoria({ itens, comOrganizacao = false, orgs = {} }) {
  if (itens.length === 0) return <Vazio>Nenhum registro aqui.</Vazio>
  return (
    <ul className="lista-auditoria">
      {agrupar(itens).map(a => {
        const quem = a.ator?.email || (a.ator?.tipo === 'sistema' ? 'Sistema' : a.ator?.tipo || 'Alguém')
        const frase = (ACAO[a.acao] || (() => a.acao))(a.dados || {}, a.alvo)
        return (
          <li key={a.id} className={ALERTA.has(a.acao) ? 'alerta' : ''}>
            <span className={`avatar ${a.ator?.tipo === 'sistema' ? 'sistema' : ''}`} aria-hidden="true">{a.ator?.tipo === 'sistema' ? '⚙' : iniciais(quem)}</span>
            <div className="auditoria-texto">
              <span><strong>{quem}</strong> {frase}{a.vezes > 1 && <> <small>· {a.vezes} vezes, até {dataHora(a.ate)}</small></>}</span>
              <small>
                {dataHora(a.em)}
                {comOrganizacao && a.organizacao_id && <> · <Link to={`/plataforma/organizacoes/${a.organizacao_id}`}>{orgs[a.organizacao_id] || a.organizacao_id}</Link></>}
                {a.dados?.ip && !['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(a.dados.ip) && <> · IP {a.dados.ip}</>}
                {' · '}<code>{a.acao}</code>
              </small>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
