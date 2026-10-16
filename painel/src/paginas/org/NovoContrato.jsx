// Novo contrato avulso. O formulário sai das variáveis do modelo, e o motor
// diz, a cada mudança, quais campos ESTE contrato precisa (PJ pede CNPJ e
// representante; PF pede CPF), o que falta e quem assina pela parte.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const GRUPOS = { contratado: 'Quem é contratado', colaborador: 'Colaborador', contrato: 'O contrato', termo: 'Condições do termo' }
const PAPEL = { parte: 'Parte', representante: 'Representante legal', testemunha: 'Testemunha', interveniente: 'Interveniente' }

const ler = (o, caminho) => caminho.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o)
function definir(o, caminho, v) {
  const copia = structuredClone(o)
  const partes = caminho.split('.')
  let alvo = copia
  for (const k of partes.slice(0, -1)) alvo = alvo[k] ??= {}
  if (v === '' || v === undefined) delete alvo[partes.at(-1)]
  else alvo[partes.at(-1)] = v
  return copia
}

export function NovoContrato() {
  const { podeEscrever, org } = useSessao()
  const navegar = useNavigate()
  const base = useDados(async () => {
    const [modelos, conta] = await Promise.all([api('/org/modelos'), api('/org/conta')])
    return { modelos, conta }
  }, [org?.id])
  const [chave, setChave] = useState('')
  const [dados, setDados] = useState({})
  const [conferencia, setConferencia] = useState(null)
  const [tentouEnviar, setTentouEnviar] = useState(false)
  const [tocados, setTocados] = useState(new Set())
  const [referencia, setReferencia] = useState('')
  const [ordem, setOrdem] = useState('paralela')
  const [prazo, setPrazo] = useState('')
  const [pelaEmpresa, setPelaEmpresa] = useState({ nome: '', email: '' })
  const [sigsEditados, setSigsEditados] = useState(null)
  const acao = useAcao()

  useEffect(() => {
    if (base.dados && !chave) {
      setChave(base.dados.modelos[0]?.chave || '')
      setPelaEmpresa(p => ({ ...p, nome: base.dados.conta.dados?.representante_nome || '' }))
    }
  }, [base.dados, chave])

  const modelo = base.dados?.modelos.find(m => m.chave === chave)

  // Confere com o motor a cada mudança (com uma pequena espera).
  const ultima = useRef(0)
  useEffect(() => {
    if (!chave) return
    const n = ++ultima.current
    const t = setTimeout(async () => {
      try {
        const r = await api(`/org/modelos/${chave}/conferir`, { metodo: 'POST', corpo: { dados } })
        if (n === ultima.current) setConferencia(r)
      } catch { /* a conferência é ajuda; o envio confere de novo */ }
    }, 250)
    return () => clearTimeout(t)
  }, [chave, dados])

  const problemas = useMemo(() => {
    const m = new Map()
    for (const f of conferencia?.faltando || []) m.set(f.variavel, 'Preencha este campo.')
    for (const i of conferencia?.invalidos || []) m.set(i.variavel, i.motivo.replace(/^./, c => c.toUpperCase()) + '.')
    return m
  }, [conferencia])

  if (base.carregando && !base.dados) return <Carregando />
  if (base.erro) return <Erro erro={base.erro} />
  if (!podeEscrever) return <p className="aviso info">Seu acesso é só de leitura.</p>

  const necessarios = new Set(conferencia?.necessarios || modelo?.variaveis.map(v => v.chave) || [])
  const visiveis = (modelo?.variaveis || []).filter(v => necessarios.has(v.chave))
  const grupos = [...new Set(visiveis.map(v => v.chave.split('.')[0]))]
  const daOrganizacao = (conferencia?.faltando || []).filter(f => f.variavel.startsWith('organizacao.'))
  const sigsParte = sigsEditados ?? (conferencia?.signatarios || []).map(s => ({ ...s }))
  // A empresa só assina se tiver e-mail: o nome vem pré-preenchido do cadastro e sozinho não decide nada.
  const signatarios = [...sigsParte, ...(pelaEmpresa.email.trim() ? [{ ...pelaEmpresa, papel: 'representante', daEmpresa: true }] : [])]

  const mudar = (k, v) => { setDados(d => definir(d, k, v)); setTocados(t => new Set(t).add(k)) }
  const mostrarProblema = (k) => (tentouEnviar || tocados.has(k)) && problemas.get(k)

  async function enviar(e) {
    e.preventDefault()
    setTentouEnviar(true)
    if (!conferencia?.pronto) return
    const sigs = signatarios.map(({ daEmpresa, ...s }) => s)
    const c = await acao.executar(async () => {
      for (const s of sigs) {
        if (String(s.nome || '').trim().split(/\s+/).length < 2) throw new Error(`Nome completo de quem assina é obrigatório ("${s.nome || 'em branco'}").`)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email || '')) throw new Error(`E-mail inválido para ${s.nome}.`)
      }
      const gerado = await api('/org/contratos', { metodo: 'POST', corpo: { modelo: chave, dados, referencia: referencia || undefined } })
      try {
        await api(`/org/contratos/${gerado.id}/enviar`, { metodo: 'POST', corpo: { signatarios: sigs, ordem, prazo_dias: prazo ? Number(prazo) : undefined } })
      } catch (err) {
        // Gerado e não enviado não serve para nada: cancela para não ficar lixo na lista.
        await api(`/org/contratos/${gerado.id}/cancelar`, { metodo: 'POST', corpo: { motivo: 'envio recusado no cadastro' } }).catch(() => {})
        throw err
      }
      return gerado
    })
    if (c) navegar(`/contratos/${c.id}`)
  }

  return (
    <>
      <Cabecalho titulo="Novo contrato" sub="Preencha os dados; o formulário mostra só o que este contrato precisa." />
      <form className="formulario-contrato" onSubmit={enviar} noValidate>
        <div className="coluna-form">
          <section className="cartao">
            <Campo rotulo="Modelo" dica={modelo?.descricao}>
              <select value={chave} onChange={e => { setChave(e.target.value); setDados({}); setConferencia(null); setSigsEditados(null); setTocados(new Set()); setTentouEnviar(false) }}>
                {base.dados.modelos.map(m => <option key={m.chave} value={m.chave}>{m.titulo}</option>)}
              </select>
            </Campo>
            {daOrganizacao.length > 0 && <p className="aviso erro">Falta no cadastro da empresa: {daOrganizacao.map(f => f.rotulo).join(', ')}. Um administrador precisa completar em "Dados da empresa".</p>}
          </section>

          {grupos.map(g => (
            <section className="cartao" key={g}>
              <h2>{GRUPOS[g] || g}</h2>
              <div className="grade-campos">
                {visiveis.filter(v => v.chave.startsWith(`${g}.`)).map(v => (
                  <CampoVariavel key={v.chave} v={v} valor={ler(dados, v.chave)} onMudar={val => mudar(v.chave, val)} problema={mostrarProblema(v.chave)} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="coluna-envio">
          <section className="cartao">
            <h2>Quem assina</h2>
            {sigsParte.length === 0 && <p className="nota">Aparece aqui quando os dados de quem é contratado estiverem preenchidos.</p>}
            {sigsParte.map((s, i) => (
              <div className="signatario-cartao" key={i}>
                <small>{PAPEL[s.papel] || s.papel}, pela outra parte</small>
                <input aria-label="Nome" value={s.nome} placeholder="Nome completo" onChange={e => { const n = structuredClone(sigsParte); n[i].nome = e.target.value; setSigsEditados(n) }} />
                <input aria-label="E-mail" type="email" value={s.email} placeholder="E-mail" onChange={e => { const n = structuredClone(sigsParte); n[i].email = e.target.value; setSigsEditados(n) }} />
              </div>
            ))}
            {sigsEditados && <button type="button" className="link-botao" onClick={() => setSigsEditados(null)}>Voltar a usar os dados do contrato</button>}
            <div className="signatario-cartao">
              <small>Pela empresa (opcional)</small>
              <input aria-label="Nome de quem assina pela empresa" value={pelaEmpresa.nome} placeholder="Nome completo" onChange={e => setPelaEmpresa(p => ({ ...p, nome: e.target.value }))} />
              <input aria-label="E-mail de quem assina pela empresa" type="email" value={pelaEmpresa.email} placeholder="E-mail" onChange={e => setPelaEmpresa(p => ({ ...p, email: e.target.value }))} />
              {!pelaEmpresa.email.trim() && <small>Sem e-mail, a empresa não assina este contrato.</small>}
            </div>
            <Campo rotulo="Ordem">
              <select value={ordem} onChange={e => setOrdem(e.target.value)}>
                <option value="paralela">Todos ao mesmo tempo</option>
                <option value="sequencial">Um de cada vez (a empresa por último)</option>
              </select>
            </Campo>
            <Campo rotulo="Prazo para assinar (dias)" dica="Em branco: 30 dias."><input inputMode="numeric" value={prazo} onChange={e => setPrazo(e.target.value.replace(/\D/g, ''))} /></Campo>
            <Campo rotulo="Referência (opcional)" dica="Um código seu para achar este contrato depois (ex.: nº do pedido)."><input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} /></Campo>
          </section>
          <Erro erro={acao.erro} onFechar={acao.limparErro} />
          {tentouEnviar && conferencia && !conferencia.pronto && <p className="aviso erro">Faltam {problemas.size} campo(s). Eles estão marcados no formulário.</p>}
          <button className="botao largo" disabled={acao.ocupado}>{acao.ocupado ? 'Gerando e enviando…' : 'Gerar e enviar para assinatura'}</button>
          <p className="nota">{conferencia?.pronto ? 'Tudo preenchido.' : 'O sistema não envia contrato com lacuna.'}</p>
        </aside>
      </form>
    </>
  )
}

function CampoVariavel({ v, valor, onMudar, problema }) {
  const obrig = v.obrigatoria !== false && v.padrao === undefined
  const padrao = v.padrao !== undefined ? `padrão: ${v.opcoes?.find(o => o.valor === v.padrao)?.texto ?? v.padrao}` : undefined
  const id = `v-${v.chave}`
  let entrada
  if (v.tipo === 'enum') {
    entrada = (
      <select id={id} value={valor ?? ''} onChange={e => onMudar(e.target.value)} aria-invalid={!!problema}>
        <option value="">{padrao ? `(${padrao})` : 'Escolha…'}</option>
        {v.opcoes.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    )
  } else if (v.tipo === 'booleano') {
    entrada = <input id={id} type="checkbox" checked={!!valor} onChange={e => onMudar(e.target.checked)} />
  } else {
    const tipos = { data: 'date', email: 'email' }
    const modos = { moeda: 'decimal', numero: 'numeric', percentual: 'decimal', cpf: 'numeric', cnpj: 'numeric' }
    const exemplos = { moeda: 'ex.: 2.350,00', cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', endereco: 'Rua, nº, bairro, cidade/UF, CEP', percentual: 'ex.: 20' }
    entrada = (
      <input id={id} type={tipos[v.tipo] || 'text'} inputMode={modos[v.tipo]} value={valor ?? ''} placeholder={padrao || exemplos[v.tipo]}
        onChange={e => onMudar(e.target.value)} aria-invalid={!!problema} />
    )
  }
  return (
    <div className={`campo${v.tipo === 'endereco' || v.chave.endsWith('objeto') ? ' largo' : ''}${problema ? ' com-erro' : ''}`}>
      <label htmlFor={id}><span>{v.rotulo.replace(/^./, c => c.toUpperCase())}{obrig && <em className="obrig"> *</em>}</span></label>
      {entrada}
      {problema && <small className="erro-campo">{problema}</small>}
    </div>
  )
}
