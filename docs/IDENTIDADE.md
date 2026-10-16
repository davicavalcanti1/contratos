# Identidade visual

Decidida em 16/out/2026, depois de comparar três direções (fé pública, bula e
linguagem simples). A escolha foi uma **mistura**: as telas juntam a bula com a
linguagem simples, e o PDF fica com a fé pública. O produto ainda não tem nome;
"Contratos" é provisório e aparece só no topo do site, no painel e no rodapé.

## Telas (assinatura, selo, painel, site): bula + linguagem simples

| | |
|---|---|
| Da **bula** | títulos em caixa-alta condensada (Archivo, `font-stretch: 72%`); marca-texto amarelo `#FFE04A` sobre o resumo; texto técnico logo abaixo, completo; seções do site como perguntas ("Para que serve?", "Contraindicações") |
| Da **linguagem simples** | o resumo vem **primeiro** e grande (Lexend 19px); cores claras: fundo branco-gelo `#F5F8FA`, ação azul-céu `#1F6AA5` (fundo claro `#E2F0FB`), ok em menta `#DAF5E7`. Sem roxo (pedido do Davi, 16/out); botões em pílula; progresso em segmentos, um por cláusula em destaque |
| Texto do contrato | Source Serif 4. Nunca escondido: a leitura até o fim é prova |
| Códigos e hashes | IBM Plex Mono, a mesma fonte do PDF |

Os tokens ficam em `public/estatico/app.css` (claro e escuro); o painel e o
site reaproveitam esses tokens. No desktop, a cláusula abre em duas colunas:
o resumo à esquerda e o texto do contrato à direita.

## PDF (contrato, via assinada, dossiê): fé pública

O documento vai para a gaveta e para o processo, por isso precisa parecer
oficial: título em Libre Caslon Display, texto em Source Serif 4, rótulos em
Public Sans, códigos em Plex Mono. Leva uma faixa de segurança hachurada na
margem e uma roseta de guilhoché desenhada por fórmula: verde no cabeçalho e
vermelho-carimbo na página de assinaturas. As fontes vão embutidas
(`src/motor/fontes/`, OFL). O código está em `src/motor/estilo-pdf.js`.

A página de verificação usa a mesma roseta em volta do ✓. Assim, quem chega
pelo QR reconhece o documento.

## Ao trocar o nome do produto

Trocar "Contratos" em `public/index.html` (topo, `<title>`, rodapé),
no componente da marca do painel (`painel/src/App.jsx`, `Entrar.jsx` e `Convite.jsx`) e no
`<title>` de `painel/index.html`.
