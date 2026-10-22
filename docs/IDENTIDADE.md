# Identidade visual

Decidida em 16/out/2026, depois de comparar três direções (fé pública, bula e
linguagem simples). A escolha foi uma **mistura**: as telas juntam a bula com a
linguagem simples, e o PDF fica com a fé pública. O produto ainda não tem nome;
"Contratos" é provisório e aparece só no topo do site, no painel e no rodapé.

## Telas públicas (assinatura, selo): bula + linguagem simples

| | |
|---|---|
| Da **bula** | títulos em caixa-alta condensada (Archivo, `font-stretch: 72%`); marca-texto amarelo `#FFE04A` sobre o resumo; texto técnico logo abaixo, completo |
| Da **linguagem simples** | o resumo vem **primeiro** e grande (Lexend 19px); cores claras: fundo branco-gelo `#F5F8FA`, ação azul-céu `#1F6AA5` (fundo claro `#E2F0FB`), ok em menta `#DAF5E7`. Sem roxo (pedido do Davi, 16/out); botões em pílula; progresso em segmentos, um por cláusula em destaque |
| Texto do contrato | Source Serif 4. Nunca escondido: a leitura até o fim é prova |
| Códigos e hashes | IBM Plex Mono, a mesma fonte do PDF |

Os tokens ficam em `public/estatico/app.css`, sempre em tema claro (o modo
escuro saiu em 17/out/2026: fundo branco é regra do produto). A casca das
telas públicas (topo, cartões, barra) é branca com contornos finos e título em
Lexend; a bula fica no conteúdo das cláusulas. O painel e o site reaproveitam
esses tokens. No desktop, a cláusula abre em duas colunas: o resumo à esquerda
e o texto do contrato à direita.

### Marca da organização (20/out/2026)

A organização pode pôr logotipo, nome de exibição e cor de destaque na tela
de assinatura e na do lote. A regra não muda: fundo branco, contornos finos.
A cor entra só nas variáveis `--acao`, `--acao-forte` e `--acao-claro`
(botões, progresso, links), e só é aceita com contraste de 4,5 com branco. O
logotipo fica acima de "Enviado por", com 36 px de altura. O amarelo da bula
e o PDF não mudam com a marca: o documento é do produto, a tela é da clínica.

## Site de apresentação: página de produto, branca e limpa

Decidido em 16/out/2026 (Davi): o site **não** usa a cara de bula. É uma
vitrine de sistema: fundo branco predominante, títulos em Lexend sem
caixa-alta, bordas finas (`#e6ebf0`), superfícies quase brancas (`#f7f9fb`),
azul-céu como única cor de ação e muito respiro. O amarelo e os títulos de
bula aparecem só **dentro da demonstração**, que é o componente real da tela
de assinatura, e no logotipo. Estilos em `public/estatico/site.css`; a seção
"O modelo é lógica" lê o motor em `/api/demo/contrato`.

## Painel: ferramenta limpa, como o site

Decidido em 16/out/2026, junto com o site: o painel segue o mesmo visual de
produto (fundo branco puro, cartões brancos com borda fina, títulos em Lexend
sem caixa-alta, azul como única cor de ação, sempre em tema claro). A caixa-alta
condensada fica só no logotipo. Estilos em `painel/src/painel.css`. A tela de
entrar tem um painel azul lateral com a promessa do produto; as telas de convite
e de redefinir senha usam a mesma estrutura.

## PDF (contrato, via assinada, dossiê): fé pública

O documento vai para a gaveta e para o processo, por isso precisa parecer
oficial: título em Libre Caslon Display, texto em Source Serif 4, rótulos em
Public Sans, códigos em Plex Mono. Leva uma faixa de segurança hachurada na
margem e uma roseta de guilhoché desenhada por fórmula: verde no cabeçalho e
vermelho-carimbo na página de assinaturas. As fontes vão embutidas
(`src/motor/fontes/`, OFL). O código está em `src/motor/estilo-pdf.js`.

A página de verificação usa a mesma roseta em volta do ✓. Assim, quem chega
pelo QR reconhece o documento.

## Nome: BullaCheck (21/out/2026)

Decidido pelo Davi depois de três rodadas (docs/MARCA.md). O wordmark é
"BULLACHECK" em Archivo condensada, com marca-texto amarelo em BULLA; o
símbolo é o quadrado azul com o traço amarelo e um check branco por cima
(`marca/simbolo.svg`, CSS `.marca-icone`). Onde o nome aparece:

Trocar "Contratos" em `public/index.html` (topo, `<title>`, rodapé),
no componente da marca do painel (`painel/src/App.jsx`, `Entrar.jsx` e `Convite.jsx`) e no
`<title>` de `painel/index.html`.
