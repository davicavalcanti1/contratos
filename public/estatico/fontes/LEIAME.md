# Fontes das telas (web)

Servidas pelo próprio sistema, em vez do Google Fonts, desde 20/out/2026:
a tela de assinatura abre em rede ruim sem depender de terceiro, e o IP de
quem assina não vai para fonts.gstatic.com. Subconjunto latino (cobre o
português), formato woff2, baixados do Google Fonts (versões abaixo).
Declaradas em `../fontes.css`. As fontes do PDF são outras
(`src/motor/fontes/`, TTF embutidas).

| Arquivo | Família | Eixos | Origem |
|---|---|---|---|
| `lexend.woff2` | Lexend | wght 300–700 (variável) | Google Fonts, Lexend v26 |
| `archivo.woff2` | Archivo | wdth 62–100, wght 500–800 (variável) | Google Fonts, Archivo v25 |
| `sourceserif4.woff2` | Source Serif 4 | opsz 8–60, wght 200–900 (variável) | Google Fonts, Source Serif 4 v15 |
| `plexmono-400.woff2`, `plexmono-500.woff2` | IBM Plex Mono | 400 e 500 | Google Fonts, IBM Plex Mono v20 |

Todas sob a SIL Open Font License 1.1. Para atualizar, baixe o subconjunto
`latin` da família no Google Fonts e troque o arquivo mantendo o nome.
