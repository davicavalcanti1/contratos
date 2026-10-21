// Dados da empresa: o que entra em todo contrato como a qualificação da
// contratante. Quem muda aqui muda os PRÓXIMOS contratos; os gerados ficam.

import { useEffect, useState } from 'react'
import { api, baixar } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, endereco, useAcao, useDados } from '../../comum.jsx'
import { Marca } from './Marca.jsx'
import { useSessao } from '../../sessao.jsx'

const MASCARA_CNPJ = (v) => v.replace(/\D/g, '').slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
const LARGURA = { razao_social: 'c-8', cnpj: 'c-4', endereco: 'c-12', representante_nome: 'c-7', representante_cargo: 'c-5', encarregado_email: 'c-7' }
const DICA = {
  endereco: 'Rua, número, complemento, bairro, cidade/UF e CEP, numa linha só.',
  encarregado_email: 'Entra na cláusula de proteção de dados como o canal para avisar incidentes (LGPD).',
  representante_nome: 'Quem assina pela empresa. Já vem preenchido ao criar contratos e lotes.',
}
const GRUPO = {
  'A empresa': ['razao_social', 'cnpj', 'endereco'],
  'Quem responde por ela': ['representante_nome', 'representante_cargo', 'encarregado_email'],
}

// Exportação completa: a prova é do cliente, e sair do sistema não a destrói.
function Exportar() {
  const acao = useAcao()
  const [feito, setFeito] = useState(false)
  const exportar = () => acao.executar(async () => { setFeito(false); await baixar('/org/exportar', 'exportacao.zip'); setFeito(true) })
  return (
    <section className="cartao exportar">
      <h2>Exportar tudo</h2>
      <p>Um .zip com todos os contratos da empresa, cada um com a via assinada, o original, o dossiê de provas, o carimbo do tempo e as instruções de conferência, mais um índice que abre no Excel, o diretório de pessoas e os dados da conta. É a sua cópia: mesmo que a conta seja encerrada, a prova continua com você.</p>
      <div className="acoes">
        <button type="button" className="botao secundario" disabled={acao.ocupado} onClick={exportar}>{acao.ocupado ? 'Preparando o arquivo…' : 'Baixar a exportação (.zip)'}</button>
        {acao.ocupado && <span className="nota">Pode levar alguns minutos com muitos contratos. Não feche a página.</span>}
        {feito && !acao.ocupado && <span className="nota">Pronto. Guarde o arquivo em lugar seguro.</span>}
      </div>
      <Erro erro={acao.erro} onFechar={acao.limparErro} />
      <p className="nota">Fica registrado na auditoria quem exportou e quando. Senhas, segredos de webhook e valores de chave de API nunca saem.</p>
    </section>
  )
}

export function Empresa() {
  const { atualizar } = useSessao()
  const { dados: e, erro, carregando, recarregar } = useDados(() => api('/admin/empresa'), [])
  const [form, setForm] = useState({})
  const [salvo, setSalvo] = useState(false)
  const acao = useAcao()

  useEffect(() => {
    if (!e) return
    const f = {}
    for (const c of e.campos) {
      const v = e.dados?.[c.chave]
      // Endereço pode estar guardado como objeto (vindo da importação); aqui vira texto.
      f[c.chave] = c.tipo === 'endereco' ? endereco(v) : v ?? ''
    }
    setForm(f)
    setSalvo(false)
  }, [e])

  if (carregando && !e) return <Carregando />
  if (erro) return <Erro erro={erro} />

  const original = Object.fromEntries(e.campos.map(c => [c.chave, c.tipo === 'endereco' ? endereco(e.dados?.[c.chave]) : e.dados?.[c.chave] ?? '']))
  const mudou = e.campos.some(c => (form[c.chave] ?? '') !== (original[c.chave] ?? ''))
  const faltando = new Set(e.cadastro_incompleto)
  const porChave = Object.fromEntries(e.campos.map(c => [c.chave, c]))

  async function salvar(ev) {
    ev.preventDefault()
    setSalvo(false)
    const r = await acao.executar(() => api('/admin/empresa', { metodo: 'PUT', corpo: { dados: form } }))
    if (r) { setSalvo(true); recarregar(); atualizar() }
  }

  return (
    <>
      <Cabecalho titulo="Dados da empresa" sub="Entram em todo contrato como a qualificação da contratante. Mudar aqui vale para os próximos; os já gerados não mudam." />
      {faltando.size > 0 && <div className="aviso erro" role="alert"><strong>Cadastro incompleto.</strong> Falta: {e.cadastro_incompleto.join(', ')}. Nenhum contrato é gerado sem isso.</div>}
      {salvo && !mudou && <p className="aviso ok" role="status">Dados salvos. Valem para os próximos contratos.</p>}
      <form className="duas-colunas largas" onSubmit={salvar} noValidate>
        <section className="cartao formulario">
          {Object.entries(GRUPO).map(([titulo, chaves]) => (
            <fieldset className="form-secao" key={titulo}>
              <legend><h2>{titulo}</h2></legend>
              <div className="campos">
                {chaves.map(k => porChave[k]).filter(Boolean).map(c => {
                  const falta = faltando.has(c.rotulo) || faltando.has(c.chave)
                  return (
                    <Campo key={c.chave} rotulo={c.rotulo} classe={`${LARGURA[c.chave] || 'c-6'}${falta ? ' com-erro' : ''}`} dica={DICA[c.chave]}>
                      <input type={c.tipo === 'email' ? 'email' : 'text'} inputMode={c.tipo === 'cnpj' ? 'numeric' : undefined} value={form[c.chave] ?? ''} aria-invalid={falta || undefined}
                        onChange={ev => setForm(f => ({ ...f, [c.chave]: c.tipo === 'cnpj' ? MASCARA_CNPJ(ev.target.value) : ev.target.value }))} />
                    </Campo>
                  )
                })}
              </div>
            </fieldset>
          ))}
          <div className="form-rodape">
            <Erro erro={acao.erro} onFechar={acao.limparErro} />
            <div className="acoes">
              <button className="botao" disabled={acao.ocupado || !mudou}>{acao.ocupado ? 'Salvando…' : 'Salvar'}</button>
              {mudou && <button type="button" className="link-botao" onClick={() => { setForm(original); setSalvo(false) }}>Descartar mudanças</button>}
            </div>
          </div>
        </section>
        <aside className="cartao">
          <h2>Como aparece no contrato</h2>
          <p className="previa-qualificacao">
            <strong>CONTRATANTE:</strong> {form.razao_social || <mark className="lacuna">razão social</mark>}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {form.cnpj || <mark className="lacuna">CNPJ</mark>}, com sede em {form.endereco || <mark className="lacuna">endereço</mark>}, neste ato representada por {form.representante_nome || <mark className="lacuna">representante</mark>}, {form.representante_cargo || <mark className="lacuna">cargo</mark>}.
          </p>
          <p className="nota">O encarregado de dados aparece na cláusula de proteção de dados: {form.encarregado_email || <mark className="lacuna">e-mail do DPO</mark>}.</p>
          <dl className="dados-lista dados-conta">
            <div><dt>Plano</dt><dd>{e.plano?.nome || '—'}{e.plano?.contratos_mes != null ? ` · até ${e.plano.contratos_mes} contratos por mês` : ' · sem limite'}</dd></div>
            <div><dt>Este mês</dt><dd>{e.consumo?.usados ?? 0} {e.consumo?.usados === 1 ? 'contrato gerado' : 'contratos gerados'}</dd></div>
            <div><dt>Usuários ativos</dt><dd>{e.usuarios}</dd></div>
            <div><dt>Situação</dt><dd>{e.status === 'ativa' ? 'Ativa' : 'Suspensa'}</dd></div>
          </dl>
          <p className="nota">Plano e limite são definidos pela plataforma. Para mudar, fale com o suporte.</p>
        </aside>
      </form>
      <Marca razao={e.dados?.razao_social} />
      <Exportar />
    </>
  )
}
