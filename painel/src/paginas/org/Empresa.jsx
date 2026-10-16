import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { Cabecalho, Campo, Carregando, Erro, endereco, useAcao, useDados } from '../../comum.jsx'
import { useSessao } from '../../sessao.jsx'

export function Empresa() {
  const { atualizar } = useSessao()
  const { dados: e, erro, carregando, recarregar } = useDados(() => api('/admin/empresa'), [])
  const [form, setForm] = useState({})
  const [ok, setOk] = useState(false)
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
  }, [e])

  if (carregando && !e) return <Carregando />
  if (erro) return <Erro erro={erro} />

  async function salvar(ev) {
    ev.preventDefault()
    setOk(false)
    const r = await acao.executar(() => api('/admin/empresa', { metodo: 'PUT', corpo: { dados: form } }))
    if (r) { setOk(true); recarregar(); atualizar() }
  }

  return (
    <>
      <Cabecalho titulo="Dados da empresa" sub="Estes dados entram em todo contrato como a qualificação da empresa." />
      {e.cadastro_incompleto.length > 0 && <p className="aviso erro">Falta: {e.cadastro_incompleto.join(', ')}. Sem isso nenhum contrato é gerado.</p>}
      <form className="cartao estreito-esq" onSubmit={salvar}>
        <Erro erro={acao.erro} onFechar={acao.limparErro} />
        {ok && <p className="aviso ok">Dados salvos. Valem para os próximos contratos; os já gerados não mudam.</p>}
        {e.campos.map(c => (
          <Campo key={c.chave} rotulo={c.rotulo} obrigatorio dica={c.tipo === 'endereco' ? 'Rua, número, bairro, cidade/UF e CEP, numa linha só.' : c.chave === 'encarregado_email' ? 'Usado na cláusula de proteção de dados como o canal para avisar incidentes.' : undefined}>
            <input type={c.tipo === 'email' ? 'email' : 'text'} value={form[c.chave] ?? ''} onChange={ev => setForm(f => ({ ...f, [c.chave]: ev.target.value }))} />
          </Campo>
        ))}
        <button className="botao" disabled={acao.ocupado}>Salvar</button>
      </form>
    </>
  )
}
