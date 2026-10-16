import { api } from '../../api.js'
import { Cabecalho, Carregando, Erro, useDados } from '../../comum.jsx'
import { TabelaAuditoria } from './Organizacao.jsx'

export function Auditoria() {
  const { dados, erro, carregando } = useDados(() => api('/plataforma/auditoria'), [])
  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro erro={erro} />
  return (
    <>
      <Cabecalho titulo="Auditoria" sub="Quem fez o quê, em todas as organizações. Registro só de acréscimo: nada aqui é editado." />
      <section className="cartao"><TabelaAuditoria itens={dados} comOrganizacao /></section>
    </>
  )
}
