// Marca da organização na tela de assinatura: nome de exibição, cor de
// destaque e logotipo, com a prévia do que a pessoa vê ao abrir o link.
// Fica em Dados da empresa, só para o administrador.

import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { Campo, Erro, useAcao, useDados } from '../../comum.jsx'

const AZUL = '#1f6aa5'

export function Marca({ razao }) {
  const { dados: m, erro, carregando, recarregar } = useDados(() => api('/admin/marca'), [])
  const [form, setForm] = useState({ nome: '', cor: '' })
  const [salvo, setSalvo] = useState(false)
  const acao = useAcao()
  const logoAcao = useAcao()

  useEffect(() => { if (m) { setForm({ nome: m.nome || '', cor: m.cor || '' }); setSalvo(false) } }, [m])

  if (carregando && !m) return null
  if (erro) return <Erro erro={erro} />

  const mudou = form.nome !== (m.nome || '') || form.cor !== (m.cor || '')
  const cor = /^#[0-9a-f]{6}$/i.test(form.cor) ? form.cor : AZUL
  const nome = form.nome.trim() || razao || 'Sua empresa'

  async function salvar(ev) {
    ev.preventDefault()
    setSalvo(false)
    const r = await acao.executar(() => api('/admin/marca', { metodo: 'PUT', corpo: form }))
    if (r) { setSalvo(true); recarregar() }
  }
  async function enviarLogo(arquivo) {
    if (!arquivo) return
    const r = await logoAcao.executar(() => api('/admin/marca/logo', { metodo: 'POST', arquivo }))
    if (r) recarregar()
  }
  async function removerLogo() {
    const r = await logoAcao.executar(() => api('/admin/marca/logo', { metodo: 'DELETE' }))
    if (r) recarregar()
  }

  return (
    <div className="duas-colunas largas">
      <section className="cartao formulario">
        <h2>Marca na tela de assinatura</h2>
        <p className="nota">É o que a pessoa vê ao abrir o link e no assunto do e-mail. Sem marca, aparece a razão social e o azul padrão. O contrato em PDF não muda.</p>
        <form onSubmit={salvar} noValidate>
          <div className="campos">
            <Campo rotulo="Nome de exibição" classe="c-7" dica='Como a empresa é conhecida: "IMAGO" em vez de "IMAGO Diagnóstico por Imagem Ltda.".'>
              <input value={form.nome} maxLength={60} placeholder={razao || ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </Campo>
            <Campo rotulo="Cor de destaque" classe="c-5" dica="Entra nos botões e no progresso. Precisa ser escura o bastante para o texto branco.">
              <span className="cor-campo">
                <input type="color" value={cor} aria-label="Escolher a cor" onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} />
                <input type="text" value={form.cor} placeholder={AZUL} maxLength={7} spellCheck={false} onChange={e => setForm(f => ({ ...f, cor: e.target.value.trim().toLowerCase() }))} />
              </span>
            </Campo>
          </div>
          <div className="logo-campo">
            <span className="rotulo-campo">Logotipo</span>
            {m.logo_url && (
              <p className="logo-atual">
                <img src={m.logo_url} alt="Logotipo atual" />
                <button type="button" className="link-botao pequeno-link" disabled={logoAcao.ocupado} onClick={removerLogo}>Remover</button>
              </p>
            )}
            <label className="botao secundario pequeno escolher-arquivo">
              {logoAcao.ocupado ? 'Enviando…' : m.logo_url ? 'Trocar o logotipo' : 'Enviar logotipo'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={e => { enviarLogo(e.target.files[0]); e.target.value = '' }} />
            </label>
            <small className="nota">PNG, JPG, WebP ou SVG, até 300 KB. Fundo transparente e formato horizontal ficam melhores.</small>
          </div>
          <Erro erro={acao.erro || logoAcao.erro} onFechar={() => { acao.limparErro(); logoAcao.limparErro() }} />
          {salvo && !mudou && <p className="aviso ok" role="status">Marca salva. Vale para quem abrir o link a partir de agora.</p>}
          <div className="acoes">
            <button className="botao" disabled={acao.ocupado || !mudou}>{acao.ocupado ? 'Salvando…' : 'Salvar marca'}</button>
            {mudou && <button type="button" className="link-botao" onClick={() => setForm({ nome: m.nome || '', cor: m.cor || '' })}>Descartar</button>}
          </div>
        </form>
      </section>
      <aside className="cartao">
        <h2>Como a pessoa vê</h2>
        <div className="previa-marca" style={{ '--acao': cor }}>
          <div className="previa-marca-topo">
            {m.logo_url && <img src={m.logo_url} alt="" />}
            <p>Enviado por {nome}</p>
            <h3>Contrato de Prestação de Serviços</h3>
          </div>
          <div className="previa-marca-corpo">
            <div className="previa-marca-etapas" aria-hidden="true"><i /><i /><i /></div>
            <p>Olá, Maria. <strong>{nome}</strong> pediu a sua assinatura como parte. Leva poucos minutos, em três passos.</p>
            <span className="previa-marca-botao">Enviar código</span>
          </div>
        </div>
        <p className="nota">Quem recebe o e-mail vê "{nome} enviou um contrato para você assinar".</p>
      </aside>
    </div>
  )
}
