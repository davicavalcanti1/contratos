// Edição do produto: o que está ligado nesta instalação.
//
// A "básica" é a versão que vai para a primeira clínica (docs/BASICA.md):
// tudo que sai continua no código e nos testes, mas some do menu, das rotas
// e do discurso. Um interruptor só, EDICAO=basica no ambiente; sem ele,
// tudo ligado (desenvolvimento, demonstração, e o produto completo depois).
//
// Cada recurso é um booleano. O servidor expõe o objeto em /eu e troca as
// páginas públicas pelos marcadores de edição (ver aplicarEdicao); o painel
// lê o objeto e esconde menu, rotas, botões e campos.

export const RECURSOS = {
  lei: '"O que diz a lei" nas cláusulas (texto do artigo citado na base legal)',
  icp: 'assinatura com certificado ICP-Brasil',
  carimbo: 'carimbo do tempo RFC 3161',
  pacote: 'pacote de prova .zip por contrato',
  derivados: 'aditivo, distrato e vida do contrato (vigência)',
  agenda: 'agenda de vencimentos e avisos antes do fim do prazo',
  reajuste: 'reajuste pelo índice oficial',
  api: 'chaves de API, webhooks e a superfície /v1',
  modelos: 'página de modelos da organização e PDF de amostra',
  demo: 'demonstração do site: motor ao vivo e contrato de exemplo por e-mail',
  exportar: 'exportação completa da organização em .zip',
  plano: 'plano e medidor de uso no painel',
  dev: 'página /dev (caixa de saída e contrato avulso)',
}

const ligar = (nome, valor) => ({ nome, ...Object.fromEntries(Object.keys(RECURSOS).map(k => [k, valor])) })

export const EDICOES = {
  completa: ligar('completa', true),
  basica: ligar('basica', false),
}

export function edicaoDoAmbiente(env = process.env) {
  const nome = String(env.EDICAO || 'completa').trim().toLowerCase()
  const e = EDICOES[nome]
  if (!e) throw new Error(`EDICAO="${env.EDICAO}" não existe. Opções: ${Object.keys(EDICOES).join(', ')}.`)
  return e
}

// Páginas públicas (site, segurança) têm trechos que só existem numa edição:
//   <!--completa--> … <!--/completa-->   some na básica
//   <!--basica … /basica-->              é comentário na completa; na básica os marcadores saem e o trecho aparece
//   __CONTATO__                          link do botão "Falar com a gente" (WhatsApp ou e-mail)
export function aplicarEdicao(html, edicao, contato = {}) {
  let saida = String(html)
  if (edicao.nome === 'basica') {
    saida = saida.replace(/<!--completa-->[\s\S]*?<!--\/completa-->/g, '')
    saida = saida.replace(/<!--basica\s*/g, '').replace(/\s*\/basica-->/g, '')
  } else {
    saida = saida.replace(/<!--completa-->|<!--\/completa-->/g, '')
  }
  return saida.replace(/__CONTATO__/g, linkDeContato(contato))
}

export function linkDeContato({ whatsapp, email } = {}) {
  const numero = String(whatsapp || '').replace(/\D/g, '')
  if (numero) return `https://wa.me/${numero}?text=${encodeURIComponent('Olá! Vi o BullaCheck e quero saber mais.')}`
  if (email) return `mailto:${String(email).trim()}`
  return '/painel'
}
