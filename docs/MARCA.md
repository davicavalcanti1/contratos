# Marca: nome, logomarca e Instagram build in public

> Escrito em 21/out/2026. Complementa IDENTIDADE.md (que trata das telas e
> do PDF). Aqui é o que a marca diz para fora: nome, símbolo, voz, e o
> Instagram onde o progresso é postado etapa por etapa.

## 1. O que a marca precisa dizer

O produto tem uma ideia só: **contrato que a pessoa entende antes de
assinar**. A bula (resumo em palavras simples + marca-texto amarelo), a
ciência cláusula a cláusula e agora "o que diz a lei" são a mesma promessa.
O nome e o símbolo precisam carregar isso, não "assinatura eletrônica",
que todo concorrente vende.

## 2. Nome

Candidatos levantados em 17/out e checados em 21/out (registro.br via RDAP;
Instagram não dá para checar sem conta, conferir no app):

| Nome | Por quê | Domínio .com.br | Risco |
|---|---|---|---|
| **Ciente** | é o que a pessoa declara ("li e estou ciente"); curto; vira verbo de uso ("manda pelo Ciente") | `ciente.com.br` ocupado; livres: `cienteapp.com.br`, `assinaciente.com.br`, `cienteja.com.br`, `ciente.net.br` | palavra comum: INPI pode ter conflito em classe de software; buscar antes |
| **Lido e Ciente** | a frase de cartório virando produto; a promessa inteira no nome; marca-texto cai em "CIENTE" | `lidoeciente.com.br` **livre** | longo para falar; handle longo |
| **Bulla** | bula (o resumo) + *bulla*, o selo de chumbo das bulas papais (o selo verificável); soa a marca | `bulla.com.br` e `.app.br` ocupados; livre `bullacontratos.com.br` | o duplo sentido precisa ser explicado |
| **Clausa** | de cláusula; soa a software | `clausa.com.br` ocupado; livre `clausa.app.br` | não diz "entender" |
| Nítido | clareza | ocupado | genérico |

Recomendação: **Ciente**, com "lido e ciente" como frase de apoio. Decisão
do Davi (issue #8). Antes de comprar domínio: busca no INPI
(busca.inpi.gov.br, classe 42 e 45) e conferir o handle no Instagram.

Para trocar o nome no código: IDENTIDADE.md, última seção.

## 3. Logomarca

Princípio: **o símbolo é o marca-texto**. É o único elemento visual que o
produto já tem e que ninguém mais usa.

- **Wordmark**: o nome em caixa-alta condensada (Archivo, `font-stretch:
  72%`, peso 800), a mesma fonte dos títulos de cláusula. Uma faixa de
  marca-texto amarelo `#FFE04A` atrás da palavra que carrega o sentido
  (em "Lido e Ciente", atrás de CIENTE; em "Ciente", atrás da palavra
  inteira). Tinta `#1B2633`.
- **Símbolo** (ícone, favicon, avatar do Instagram): um quadrado branco com
  borda fina, e dentro dele um traço curto de marca-texto amarelo com a
  inicial do nome por cima, em caixa-alta condensada. Lê-se de longe, funciona
  em 32 px, e é a bula em miniatura.
- **Não fazer**: gradiente, roxo (pedido do Davi), ícone de caneta ou de
  documento com assinatura (é o que os outros usam), fundo escuro.
- Arquivos: `marca/logo.svg` (wordmark), `marca/simbolo.svg`, `marca/avatar.png`
  (1080×1080), gerados por `node ferramentas/marca.mjs` depois do nome
  decidido. Até lá o site e o painel seguem com "CONTRATOS".

Paleta e tipografia já estão em `public/estatico/app.css` e IDENTIDADE.md:
branco, tinta `#1B2633`, azul `#1F6AA5`, amarelo `#FFE04A`, Lexend para
texto, Archivo condensada para títulos de bula, Source Serif 4 para o
texto do contrato.

## 4. Instagram build in public

**Conta da marca, voz na primeira pessoa do Davi.** Build in public funciona
quando tem gente, não logotipo falando. A bio diz quem está construindo.

- **Handle**: o nome decidido (`@ciente.app`, `@lidoeciente`…), conferir
  disponibilidade no app. Nome de exibição: "Ciente · contrato com bula".
- **Bio** (150 caracteres):
  > Construindo em público um jeito de assinar contrato entendendo o que
  > está assinando. Por Davi, estudante de medicina. Progresso toda semana.
- **Link**: o site. Até ter domínio, o link do GitHub.
- **Avatar**: `marca/avatar.png` (símbolo).

### Pilares de conteúdo (um por post, nesta proporção)

| Pilar | Proporção | Exemplo |
|---|---|---|
| **Diário de construção** | 50% | "Esta semana: o artigo da lei embaixo de cada cláusula. Por quê, como, o que falhou." |
| **Bastidor e decisão** | 20% | "Construímos 9 etapas em 4 dias e nenhuma foi validada. Vamos voltar atrás." |
| **O problema** | 20% | "Você leu o último contrato que assinou? Um contrato de médico PJ tem 15 cláusulas." |
| **Pergunta ao público** | 10% | "Esse nome diz o que o produto faz? Comenta o que você acha que é." |

### Formato

- **Carrossel 1080×1350** (4:5), fundo branco, contornos finos, título em
  Archivo condensada caixa-alta com marca-texto, texto em Lexend. É a
  identidade do produto, sem adaptação: o post parece a tela.
- Slide 1: uma frase. Slides 2 a 5: um ponto por slide, com print real do
  sistema quando houver. Último slide: "o que vem na semana que vem" e a
  pergunta.
- Legenda: 3 a 6 linhas, primeira pessoa, sem hashtag no corpo; 5 hashtags
  no primeiro comentário (`#buildinpublic #saas #contratos #lgpd
  #empreendedorismo`).
- **Cadência**: 3 posts por semana (segunda: o que vem; quinta: diário de
  construção; sábado: problema ou pergunta), e stories quando houver print.
- Os posts saem de `marca/posts/<numero>-<slug>/`: um `post.html` por slide
  renderizado em PNG por `node ferramentas/post.mjs`, e `legenda.md`.

### Regras

- Mostrar tela de verdade, nunca mockup. Se a tela está feia, o post diz.
- Número real: commits, testes, pessoas que validaram.
- Nada de cliente ou contrato real sem autorização; os prints usam a
  organização de exemplo.
- Não prometer data; dizer "próximo lançamento" e o que ele testa.

## 5. Primeiros seis posts

| # | Pilar | Título (slide 1) | Quando |
|---|---|---|---|
| 1 | Bastidor | "Construí um sistema de contratos em 4 dias. Agora vou voltar atrás." | ao decidir o nome |
| 2 | Pergunta | "Esse nome diz o que o produto faz?" (o nome, a frase de apoio, o símbolo) | 2 dias depois |
| 3 | O problema | "Você leu o último contrato que assinou?" | semana 1 |
| 4 | Diário | "A bula: o contrato explicado em palavras simples, cláusula a cláusula" (prints) | semana 1 |
| 5 | Diário | "O que diz a lei, embaixo de cada cláusula" (prints do bloco aberto) | semana 2 |
| 6 | Diário | "O primeiro link que saiu da minha máquina" (v0.11) | semana 2 |

O texto do post 1 está em `marca/posts/001-voltar-atras/legenda.md`.
