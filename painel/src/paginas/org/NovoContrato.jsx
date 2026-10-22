// Novo contrato avulso. O formulário sai das variáveis do modelo, e o motor
// diz, a cada mudança, quais campos ESTE contrato precisa (PJ pede CNPJ e
// representante; PF pede CPF), o que falta e quem assina pela parte. A prévia
// mostra o contrato montado, com as lacunas marcadas, antes de gerar.
//
// Chega preenchido de dois jeitos: ?de=<id> (novo a partir de um contrato
// existente: mesmos dados, data de início em branco) e ?parte=<id> (alguém do
// diretório de pessoas). Dentro do formulário, o grupo da parte tem uma busca
// no diretório que preenche o grupo inteiro.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, data, endereco, Erro, Fundamentos, plural, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

const GRUPOS = { contratado: 'Quem é contratado', colaborador: 'Colaborador', contrato: 'O contrato', termo: 'Condições do termo' }
const DESCRICAO_GRUPO = { contratado: 'A outra parte do contrato. Os campos mudam conforme o tipo escolhido.', colaborador: 'Quem assina o termo.', contrato: 'Objeto, valor, prazo e condições.', termo: 'Parâmetros do termo.' }
// O grupo já diz de quem é o campo: "CPF do contratado" vira "CPF".
const cap = (s) => String(s).replace(/^./, c => c.toUpperCase())
const encurtar = (rotulo) => rotulo
  .replace(/\s*\(ou do titular do MEI\)/i, '')
  .replace(/\s+(do|da|dos|das)\s+(contratad[oa]|colaborador|contratante)$/i, '')
// Largura na grade de 12 colunas, pelo tipo e por alguns campos conhecidos.
const LARGURA = { cpf: 4, cnpj: 4, data: 4, numero: 4, percentual: 4, moeda: 4, enum: 4, email: 6, texto: 6, endereco: 12, booleano: 6 }
// Rótulos que ficam longos demais para a coluna.
const ROTULO_CURTO = { 'contrato.multa_percentual': 'Multa de resilição (%)', 'contrato.aviso_previo_dias': 'Aviso prévio (dias)', 'termo.anos_sigilo': 'Anos de sigilo após sair' }
const LARGURA_CAMPO = {
  'contratado.nome': 8, 'contratado.nacionalidade': 4, 'contratado.estado_civil': 4, 'contratado.profissao': 4, 'contratado.email': 8, 'contratado.representante_nome': 8,
  'contrato.foro_comarca': 4, 'colaborador.nome': 8, 'colaborador.cargo': 6, 'colaborador.matricula': 6,
}
const PAPEL = { parte: 'Parte', representante: 'Representante legal', testemunha: 'Testemunha', interveniente: 'Interveniente' }

// Endereço pode vir estruturado (de API, planilha ou contrato antigo); o
// formulário edita texto, então ele entra já formatado. O motor aceita os dois.
const planificar = (modelo, dados) => {
  const copia = structuredClone(dados || {})
  for (const v of modelo?.variaveis || []) {
    if (v.tipo !== 'endereco') continue
    const [g, k] = v.chave.split('.')
    if (copia[g] && copia[g][k] && typeof copia[g][k] === 'object') copia[g][k] = endereco(copia[g][k])
  }
  return copia
}
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

// Máscaras de digitação: só organizam o que a pessoa digita; quem valida é o motor.
const MASCARAS = {
  cpf: (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
  cnpj: (v) => v.replace(/\D/g, '').slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'),
}

export function NovoContrato() {
  const { podeEscrever, org, edicao } = useSessao()
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const deId = params.get('de')
  const parteId = params.get('parte')
  const modeloUrl = params.get('modelo')
  const base = useDados(async () => {
    const [modelos, conta, origem, parte] = await Promise.all([
      api('/org/modelos'), api('/org/conta'),
      deId ? api(`/org/contratos/${deId}`) : null,
      parteId ? api(`/org/partes/${parteId}`) : null,
    ])
    return { modelos, conta, origem, parte }
  }, [org?.id, deId, parteId])
  const [chave, setChave] = useState('')
  const [dados, setDados] = useState({})
  const [conferencia, setConferencia] = useState(null)
  const [tentouEnviar, setTentouEnviar] = useState(false)
  const [tocados, setTocados] = useState(new Set())
  const [referencia, setReferencia] = useState('')
  const [ordem, setOrdem] = useState('paralela')
  const [prazo, setPrazo] = useState('')
  const [pelaEmpresa, setPelaEmpresa] = useState({ nome: '', email: '', metodo: 'otp', cpf: '' })
  // Método de cada signatário da outra parte, pela posição (a lista vem do motor e é refeita a cada mudança).
  const [metodos, setMetodos] = useState({})
  const [sigsEditados, setSigsEditados] = useState(null)
  const [previaAberta, setPreviaAberta] = useState(false)
  const [previa, setPrevia] = useState(null)
  const acao = useAcao()

  const [avisoOrigem, setAvisoOrigem] = useState(null)
  useEffect(() => {
    if (!base.dados || chave) return
    const { modelos, conta, origem, parte } = base.dados
    let escolhido = modelos[0]?.chave || ''
    let empresa = null
    if (modeloUrl && modelos.some(m => m.chave === modeloUrl)) escolhido = modeloUrl
    if (origem) {
      // Mesmos dados do contrato de origem, menos a organização (vem do
      // cadastro) e a data de início (é do contrato novo).
      const { organizacao, ...resto } = structuredClone(origem.dados || {})
      if (resto.contrato) delete resto.contrato.data_inicio
      const modeloOrigem = modelos.find(m => m.chave === origem.modelo?.chave)
      setDados(planificar(modeloOrigem, resto))
      if (modeloOrigem) escolhido = modeloOrigem.chave
      else setAvisoOrigem(`O modelo do contrato de origem ("${origem.modelo?.chave}") não está mais disponível. Escolha outro modelo; os dados preenchidos ficam.`)
      // Quem assinou pela empresa no original: o representante cujo e-mail não é de nenhuma parte.
      const daParte = new Set(Object.values(resto).flatMap(g => (g && typeof g === 'object' && g.email ? [String(g.email).toLowerCase()] : [])))
      empresa = (origem.signatarios || []).find(s => s.papel === 'representante' && !daParte.has(String(s.email || '').toLowerCase())) || null
    } else if (parte) {
      const serve = (m) => m.variaveis.some(v => v.chave.startsWith(`${parte.grupo}.`))
      escolhido = (modelos.find(m => m.chave === parte.ultimo_modelo && serve(m)) || modelos.find(serve))?.chave || escolhido
      setDados(planificar(modelos.find(m => m.chave === escolhido), { [parte.grupo]: parte.dados || {} }))
    }
    setChave(escolhido)
    setPelaEmpresa(p => ({ ...p, nome: empresa?.nome || conta.dados?.representante_nome || '', email: empresa?.email || '', metodo: empresa?.metodo === 'icp' ? 'icp' : 'otp' }))
  }, [base.dados, chave])

  const modelo = base.dados?.modelos.find(m => m.chave === chave)
  const origem = base.dados?.origem || null
  const parte = base.dados?.parte || null

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

  // A prévia acompanha o formulário enquanto estiver aberta.
  const ultimaPrevia = useRef(0)
  useEffect(() => {
    if (!chave || !previaAberta) return
    const n = ++ultimaPrevia.current
    const t = setTimeout(async () => {
      try {
        const r = await api(`/org/modelos/${chave}/previa`, { metodo: 'POST', corpo: { dados } })
        if (n === ultimaPrevia.current) setPrevia(r)
      } catch (e) { if (n === ultimaPrevia.current) setPrevia({ erro: e }) }
    }, 300)
    return () => clearTimeout(t)
  }, [chave, dados, previaAberta])

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
  // Sem reajuste na edição, o índice nem aparece: fica o padrão do modelo.
  const visiveis = (modelo?.variaveis || []).filter(v => necessarios.has(v.chave) && (edicao.reajuste || v.chave !== 'contrato.indice_reajuste'))
  const grupos = [...new Set(visiveis.map(v => v.chave.split('.')[0]))]
  // Grupos que descrevem uma parte (origem parte/fonte) ganham a busca no diretório.
  const gruposParte = new Set((modelo?.variaveis || []).filter(v => ['parte', 'fonte'].includes(v.origem)).map(v => v.chave.split('.')[0]))
  const preencherDoDiretorio = (g, p) => {
    const chaves = new Set(modelo.variaveis.filter(v => v.chave.startsWith(`${g}.`)).map(v => v.chave.slice(g.length + 1)))
    const novo = Object.fromEntries(Object.entries(p.dados || {}).filter(([k]) => chaves.has(k)))
    if (chaves.has('tipo') && !novo.tipo && p.tipo) novo.tipo = p.tipo
    setDados(d => ({ ...d, ...planificar(modelo, { [g]: novo }) }))
    setSigsEditados(null)
    setTocados(new Set())
  }
  const daOrganizacao = (conferencia?.faltando || []).filter(f => f.variavel.startsWith('organizacao.'))
  const sigsParte = sigsEditados ?? (conferencia?.signatarios || []).map(s => ({ ...s }))
  // A empresa só assina se tiver e-mail: o nome vem pré-preenchido do cadastro e sozinho não decide nada.
  const signatarios = [
    ...sigsParte.map((s, i) => ({ ...s, metodo: metodos[i]?.metodo || 'otp', cpf: metodos[i]?.cpf || s.cpf || undefined })),
    ...(pelaEmpresa.email.trim() ? [{ ...pelaEmpresa, cpf: pelaEmpresa.cpf || undefined, papel: 'representante', daEmpresa: true }] : []),
  ]
  const preenchidos = visiveis.filter(v => !problemas.has(v.chave) && (ler(dados, v.chave) !== undefined || v.padrao !== undefined)).length
  const faltamDoFormulario = [...problemas.keys()].filter(k => !k.startsWith('organizacao.')).length

  const trocarModelo = (nova) => { setChave(nova); setDados({}); setConferencia(null); setPrevia(null); setSigsEditados(null); setTocados(new Set()); setTentouEnviar(false) }
  const mudar = (k, v) => { setDados(d => definir(d, k, v)); setTocados(t => new Set(t).add(k)) }
  const mostrarProblema = (k) => (tentouEnviar || tocados.has(k)) && problemas.get(k)

  async function enviar(e) {
    e.preventDefault()
    setTentouEnviar(true)
    if (!conferencia?.pronto) { document.querySelector('.campo.com-erro input, .campo.com-erro select')?.focus(); return }
    const sigs = signatarios.map(({ daEmpresa, ...s }) => s)
    const c = await acao.executar(async () => {
      if (sigs.length === 0) throw new Error('Ninguém assina este contrato: preencha quem é contratado ou quem assina pela empresa.')
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
      <Cabecalho titulo="Novo contrato" sub="Escolha o modelo e preencha. O formulário mostra só o que este contrato precisa, e nada vai para assinatura com lacuna." />
      {origem && <p className="aviso info">Preenchido a partir de <Link to={`/contratos/${origem.id}`}>{origem.titulo}{origem.referencia ? ` (ref. ${origem.referencia})` : ''}</Link>. Confira os dados e informe a data de início: o contrato novo nasce independente do anterior.</p>}
      {parte && <p className="aviso info">Preenchido com o cadastro de <strong>{parte.nome}</strong>, do diretório de pessoas. O que você mudar aqui atualiza o diretório quando o contrato for gerado.</p>}
      {avisoOrigem && <p className="aviso erro">{avisoOrigem}</p>}
      <form className="formulario-contrato" onSubmit={enviar} noValidate>
        <div className="coluna-form">
          <section className="cartao">
            <h2>Modelo</h2>
            <div className="modelos-cartoes" role="radiogroup" aria-label="Modelo">
              {base.dados.modelos.map(m => (
                <button type="button" key={m.chave} role="radio" aria-checked={m.chave === chave} className="modelo-cartao" onClick={() => m.chave !== chave && trocarModelo(m.chave)}>
                  <i className="radio" aria-hidden="true" />
                  <span className="modelo-texto"><strong>{m.titulo}</strong><span>{m.descricao}</span></span>
                </button>
              ))}
            </div>
            {daOrganizacao.length > 0 && <p className="aviso erro">Falta no cadastro da empresa: {daOrganizacao.map(f => f.rotulo).join(', ')}. Um administrador precisa completar em "Dados da empresa".</p>}
          </section>

          <section className="cartao formulario">
            {grupos.map(g => (
              <fieldset className="form-secao" key={g}>
                <legend><h2>{GRUPOS[g] || g}</h2>{DESCRICAO_GRUPO[g] && <p>{DESCRICAO_GRUPO[g]}</p>}</legend>
                {gruposParte.has(g) && <BuscaDiretorio onEscolher={p => preencherDoDiretorio(g, p)} />}
                <div className="campos">
                  {visiveis.filter(v => v.chave.startsWith(`${g}.`)).map(v => (
                    <CampoVariavel key={v.chave} v={v} valor={ler(dados, v.chave)} onMudar={val => mudar(v.chave, val)} problema={mostrarProblema(v.chave)} />
                  ))}
                </div>
              </fieldset>
            ))}
          </section>

          <section className="cartao previa">
            <div className="cartao-topo">
              <h2>Prévia do contrato</h2>
              <button type="button" className="link-botao pequeno-link" aria-expanded={previaAberta} onClick={() => setPreviaAberta(v => !v)}>{previaAberta ? 'Fechar a prévia' : 'Ver como vai ficar'}</button>
            </div>
            {!previaAberta && <p className="nota">O texto montado pelo motor com o que você já preencheu, com as lacunas marcadas. É o que a pessoa vai ler, com a bula.</p>}
            {previaAberta && !previa && <Carregando texto="Montando…" />}
            {previaAberta && previa?.erro && <Erro erro={previa.erro} />}
            {previaAberta && previa?.contrato && <Previa previa={previa} />}
          </section>
        </div>

        <aside className="coluna-envio">
          <section className="cartao">
            <h2>Quem assina</h2>
            {sigsParte.length === 0 && <p className="nota">Aparece aqui quando os dados de quem é contratado estiverem preenchidos.</p>}
            {sigsParte.map((s, i) => (
              <div className="signatario" key={i}>
                <p className="signatario-papel">{PAPEL[s.papel] || s.papel} <span>· pela outra parte</span></p>
                <div className="campos">
                  <Campo rotulo="Nome completo" classe="c-12"><input value={s.nome} onChange={e => { const n = structuredClone(sigsParte); n[i].nome = e.target.value; setSigsEditados(n) }} /></Campo>
                  <Campo rotulo="E-mail" classe="c-12"><input type="email" value={s.email} onChange={e => { const n = structuredClone(sigsParte); n[i].email = e.target.value; setSigsEditados(n) }} /></Campo>
                  {edicao.icp && <Metodo valor={{ metodo: metodos[i]?.metodo || 'otp', cpf: metodos[i]?.cpf ?? s.cpf ?? '' }} onMudar={v => setMetodos(m => ({ ...m, [i]: v }))} />}
                </div>
              </div>
            ))}
            {sigsEditados && <p className="nota"><button type="button" className="link-botao pequeno-link" onClick={() => setSigsEditados(null)}>Voltar a usar os dados do contrato</button></p>}
            <div className="signatario">
              <p className="signatario-papel">Pela empresa <span>· opcional</span></p>
              <div className="campos">
                <Campo rotulo="Nome completo" classe="c-12"><input value={pelaEmpresa.nome} onChange={e => setPelaEmpresa(p => ({ ...p, nome: e.target.value }))} /></Campo>
                <Campo rotulo="E-mail" classe="c-12" dica={!pelaEmpresa.email.trim() ? 'Sem e-mail, a empresa não assina este contrato.' : undefined}><input type="email" value={pelaEmpresa.email} onChange={e => setPelaEmpresa(p => ({ ...p, email: e.target.value }))} /></Campo>
                {edicao.icp && pelaEmpresa.email.trim() && <Metodo valor={pelaEmpresa} onMudar={v => setPelaEmpresa(p => ({ ...p, ...v }))} />}
              </div>
            </div>
          </section>

          <section className="cartao">
            <h2>Envio</h2>
            <div className="campos">
              <Campo rotulo="Ordem" classe="c-8">
                <select value={ordem} onChange={e => setOrdem(e.target.value)}>
                  <option value="paralela">Todos ao mesmo tempo</option>
                  <option value="sequencial">Um de cada vez, a empresa por último</option>
                </select>
              </Campo>
              <Campo rotulo="Prazo (dias)" classe="c-4"><input inputMode="numeric" placeholder="30" value={prazo} onChange={e => setPrazo(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Campo>
              <Campo rotulo="Referência" classe="c-12" dica="Opcional. Um código seu para achar este contrato depois, como o nº do pedido."><input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} /></Campo>
            </div>
          </section>

          <section className="cartao resumo-envio">
            <ul className="resumo-envio-lista">
              <li className={conferencia?.pronto ? 'ok' : 'pendente'}>
                <b>{conferencia ? (conferencia.pronto ? 'Tudo preenchido' : `${plural(faltamDoFormulario, 'campo falta', 'campos faltam')}`) : 'Conferindo…'}</b>
                <span>{visiveis.length ? `${preenchidos} de ${visiveis.length} campos deste contrato` : ''}</span>
              </li>
              <li className={signatarios.length ? 'ok' : 'pendente'}>
                <b>{signatarios.length ? plural(signatarios.length, 'pessoa assina', 'pessoas assinam') : 'Ninguém assina ainda'}</b>
                <span>{signatarios.map(s => s.nome?.split(' ')[0]).filter(Boolean).join(', ') || 'preencha quem é contratado'}</span>
              </li>
              <li className="ok">
                <b>Prazo de {prazo || 30} dias</b>
                <span>{ordem === 'paralela' ? 'todos recebem o link agora' : 'um de cada vez, a empresa por último'}</span>
              </li>
            </ul>
            <Erro erro={acao.erro} onFechar={acao.limparErro} />
            {tentouEnviar && conferencia && !conferencia.pronto && <p className="aviso erro">Faltam {plural(faltamDoFormulario, 'campo', 'campos')}. Eles estão marcados no formulário.</p>}
            <button className="botao largo" disabled={acao.ocupado}>{acao.ocupado ? 'Gerando e enviando…' : 'Gerar e enviar para assinatura'}</button>
            <p className="nota">O PDF é gerado agora e cada pessoa recebe o link por e-mail. Depois de assinado, o texto não muda.</p>
          </section>
        </aside>
      </form>
    </>
  )
}

// O contrato montado, no mesmo componente de cláusula da tela de assinatura.
// Lacunas ({{variável}}) viram marcas com o rótulo do campo.
function Previa({ previa }) {
  const { contrato, rotulos, faltando, invalidos } = previa
  const marcar = (texto) => {
    const partes = String(texto).split(/(\{\{\s*[\w.:|]+\s*\}\})/)
    return partes.map((p, i) => {
      const m = p.match(/^\{\{\s*([\w.:]+)/)
      if (!m) return p
      return <mark key={i} className="lacuna" title="Campo ainda não preenchido">{rotulos[m[1]] || m[1]}</mark>
    })
  }
  const problemas = faltando.length + invalidos.length
  return (
    <div className="previa-corpo">
      <p className={`aviso ${problemas ? 'info' : 'ok'}`}>
        {problemas ? <>{plural(problemas, 'lacuna marcada', 'lacunas marcadas')} em amarelo. O contrato só é gerado quando todas estiverem preenchidas.</> : 'Sem lacunas: é assim que a pessoa vai ler.'}
      </p>
      <h3 className="previa-titulo">{marcar(contrato.titulo)}</h3>
      {contrato.preambulo && <p className="preambulo">{marcar(contrato.preambulo)}</p>}
      <div className="documento compacto">
        {contrato.clausulas.map(c => (
          <article key={c.chave} className={`clausula${c.critica ? ' critica' : ''}`}>
            <p className="cl-num">Cláusula {c.numero}{c.critica && <span className="destaque">Em destaque</span>}</p>
            <h3>{c.titulo}</h3>
            {c.resumo && <p className="bula"><span className="rotulo">Em palavras simples</span><mark>{marcar(c.resumo)}</mark></p>}
            <div className="texto-juridico">
              {c.paragrafos.map(p => <p key={p.numero}><span className="pnum">{p.numero}</span>{marcar(p.texto)}</p>)}
              <Fundamentos itens={c.fundamentos} />
            </div>
          </article>
        ))}
      </div>
      {contrato.fecho && <p className="fecho">{marcar(contrato.fecho)}</p>}
    </div>
  )
}

function CampoVariavel({ v, valor, onMudar, problema }) {
  const obrig = v.obrigatoria !== false && v.padrao === undefined
  const padrao = v.padrao !== undefined ? String(v.opcoes?.find(o => o.valor === v.padrao)?.texto ?? v.padrao) : undefined
  const largura = v.chave.endsWith('objeto') ? 12 : (LARGURA_CAMPO[v.chave] ?? LARGURA[v.tipo] ?? 6)
  const rotulo = ROTULO_CURTO[v.chave] || encurtar(v.rotulo).replace(/^./, c => c.toUpperCase())
  const id = `v-${v.chave}`
  let entrada
  if (v.tipo === 'enum') {
    entrada = (
      <select id={id} value={valor ?? ''} onChange={e => onMudar(e.target.value)} aria-invalid={!!problema}>
        <option value="">{padrao ? `Padrão: ${cap(padrao)}` : 'Escolha…'}</option>
        {v.opcoes.map(o => <option key={o.valor} value={o.valor}>{cap(o.texto)}</option>)}
      </select>
    )
  } else if (v.tipo === 'booleano') {
    entrada = <input id={id} type="checkbox" checked={!!valor} onChange={e => onMudar(e.target.checked)} />
  } else if (v.chave.endsWith('objeto')) {
    entrada = <textarea id={id} value={valor ?? ''} rows={2} placeholder="Ex.: manutenção preventiva dos computadores da recepção, com visita semanal" onChange={e => onMudar(e.target.value)} aria-invalid={!!problema} />
  } else {
    const tipos = { data: 'date', email: 'email' }
    const modos = { moeda: 'decimal', numero: 'numeric', percentual: 'decimal', cpf: 'numeric', cnpj: 'numeric' }
    const exemplos = { moeda: '2.350,00', cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', endereco: 'Rua, nº, complemento, bairro, cidade/UF, CEP', percentual: '20' }
    const mascara = MASCARAS[v.tipo]
    entrada = (
      <input id={id} type={tipos[v.tipo] || 'text'} inputMode={modos[v.tipo]} value={valor ?? ''} placeholder={padrao ? cap(padrao) : exemplos[v.tipo]}
        onChange={e => onMudar(mascara ? mascara(e.target.value) : e.target.value)} aria-invalid={!!problema} />
    )
  }
  return (
    <div className={`campo c-${largura}${problema ? ' com-erro' : ''}`}>
      <label htmlFor={id} title={v.rotulo}><span>{rotulo}{!obrig && <em className="opcional">{padrao !== undefined ? 'padrão' : 'opcional'}</em>}</span></label>
      {entrada}
      {problema ? <small className="erro-campo">{problema}</small> : padrao !== undefined && v.tipo !== 'enum' && <small>Em branco, fica {cap(padrao)}.</small>}
    </div>
  )
}

// Busca no diretório de pessoas (quem já recebeu contrato) e preenche o grupo
// inteiro. Quem não está lá entra quando o contrato for gerado.
function BuscaDiretorio({ onEscolher }) {
  const [termo, setTermo] = useState('')
  const [itens, setItens] = useState(null)
  const [aberto, setAberto] = useState(false)
  const ultima = useRef(0)
  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) { setItens(null); return }
    const n = ++ultima.current
    const h = setTimeout(async () => {
      try { const r = await api(`/org/partes?busca=${encodeURIComponent(t)}&limite=8`); if (n === ultima.current) setItens(r.itens) } catch { if (n === ultima.current) setItens([]) }
    }, 250)
    return () => clearTimeout(h)
  }, [termo])
  const escolher = (p) => { onEscolher(p); setTermo(''); setItens(null); setAberto(false) }
  return (
    <div className="busca-diretorio">
      <label className="campo">
        <span>Já tem contrato com esta pessoa? Busque no diretório</span>
        <input type="search" placeholder="Nome, CPF, CNPJ ou e-mail" value={termo} autoComplete="off"
          onChange={e => { setTermo(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} />
      </label>
      {aberto && itens && (
        <ul className="busca-diretorio-lista" aria-label="Pessoas encontradas">
          {itens.length === 0
            ? <li className="busca-diretorio-vazio">Ninguém com "{termo.trim()}" no diretório ainda. Preencha abaixo: a pessoa entra no diretório quando o contrato for gerado.</li>
            : itens.map(p => (
              <li key={p.id}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => escolher(p)}>
                  <strong>{p.nome}</strong>
                  <small>{[p.cnpj ? `CNPJ ${p.cnpj}` : p.cpf ? `CPF ${p.cpf}` : null, p.email, `${plural(p.contratos, 'contrato', 'contratos')}, último em ${data(p.ultimo_em)}`].filter(Boolean).join(' · ')}</small>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

// Como cada pessoa assina: código por e-mail (padrão) ou certificado ICP-Brasil,
// que precisa do CPF — é com ele que o certificado é conferido.
function Metodo({ valor, onMudar }) {
  return (
    <>
      <Campo rotulo="Como assina" classe={valor.metodo === 'icp' ? 'c-7' : 'c-12'}>
        <select value={valor.metodo} onChange={e => onMudar({ ...valor, metodo: e.target.value })}>
          <option value="otp">Código por e-mail</option>
          <option value="icp">Certificado ICP-Brasil</option>
        </select>
      </Campo>
      {valor.metodo === 'icp' && <Campo rotulo="CPF do certificado" classe="c-5"><input inputMode="numeric" placeholder="000.000.000-00" value={valor.cpf || ''} onChange={e => onMudar({ ...valor, cpf: MASCARAS.cpf(e.target.value) })} /></Campo>}
    </>
  )
}
