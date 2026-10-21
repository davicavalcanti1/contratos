# Legislação local: o texto da lei dentro do produto

> Desde 21/out/2026. A `base_legal` de cada cláusula deixou de ser texto
> solto: ela aponta para o artigo de verdade, e a bula mostra "o que diz a
> lei" embaixo de cada cláusula.

## O que é

Uma pasta `legislacao/` com o texto **compilado e vigente** das normas
federais que as cláusulas citam, em Markdown, um arquivo por norma, mais um
módulo (`src/legislacao/legislacao.js`) que indexa os artigos e lê as
citações do jeito que o redator escreve.

| Arquivo | O quê |
|---|---|
| `legislacao/normas.json` | **catálogo curado**: sigla, nome, número, ano e caminho no repositório de origem. É o que se edita para citar uma norma nova |
| `legislacao/*.md` | o texto de cada norma, baixado (Código Civil, CPC, CLT, CDC, Código Penal, LGPD, MP 2.200-2, Lei 14.063, Lei 10.192, Lei 9.279) |
| `legislacao/fontes.json` | **gerado**: URL, URN LexML, data em que a fonte coletou, SHA-256 e data em que baixamos |
| `src/legislacao/legislacao.js` | índice por artigo, leitor de citações, `resolver()` e `fundamentos()` |
| `ferramentas/legislacao.mjs` | `atualizar`, `conferir`, `ver` |

Fonte: [github.com/ctresb/leis](https://github.com/ctresb/leis), que converte
o normas.leg.br (Senado) em Markdown com cabeçalho estruturado. O texto é
"compilado (texto vigente)": emendas aplicadas, tachados removidos. Texto de
lei é domínio público (Lei 9.610/1998, art. 8º, IV). **O que vale é a
publicação no Diário Oficial**; a bula diz isso.

Não clonamos o repositório inteiro (4 GB, 323 mil normas): baixamos só as
que o catálogo lista, cerca de 2,5 MB.

## Como o redator cita

No campo "Base legal" da cláusula, como sempre se escreveu:

```
CC art. 598
CC arts. 593 a 609
CPC art. 784, III e §4º
Lei 13.709/2018, arts. 7º, V, 39 e 46
CLT art. 482, g; Lei 9.279/1996 art. 195, XI
CLT art. 2º (poder diretivo); Lei 13.709/2018 art. 6º
MP 2.200-2/2001 art. 10 §2º. Sem cláusula de foro: em matéria trabalhista…
Lei 14.063/2020
```

Regras: trechos separados por `;`. Cada trecho é uma norma (sigla, nome ou
"Lei 13.709/2018") seguida de `art.`/`arts.` e os artigos, separados por
vírgula e "e"; `a` faz faixa; `§ 2º`, `III` e `g` depois do artigo pedem só
esse dispositivo (a bula mostra o caput e ele). Parêntese vira observação do
artigo; texto depois de ponto final vira observação do trecho. Norma sem
artigo cita a lei inteira.

## Onde aparece

- **Tela de assinatura** (`assinar.js`): embaixo do texto de cada cláusula,
  um bloco fechado "O que diz a lei" com a citação; aberto, mostra o artigo
  com parágrafos, incisos e alíneas, a nota de redação e um link para a
  fonte com a data da coleta. Resolvido na hora a partir da `base_legal`
  gravada no snapshot do contrato: contrato antigo sem base legal não mostra
  nada, e mudar a biblioteca não muda contrato existente.
- **Painel**: na página do modelo (organização), na prévia do novo contrato,
  na prévia do editor de modelo e no editor de cláusula, onde o artigo
  aparece **enquanto o revisor digita** a base legal, com os problemas ditos
  na hora ("CC art. 9999 não existe", "norma não está na legislação local").
- **Demonstração do site** (`/api/demo/contrato`): cada cláusula vem com
  `fundamentos`.
- **Pacote de prova** (`LEIA-ME.txt`): lista "fundamento legal por cláusula"
  como registrado na biblioteca.

## Linter

`lintModelo` passou a conferir a base legal de cada cláusula do modelo:

| Situação | Resultado |
|---|---|
| artigo que não existe na norma, artigo revogado, norma revogada, `§ 99º` que não existe | **grave** (bloqueia publicar) |
| norma que não está no catálogo, ou catalogada e não baixada | aviso |
| cláusula sem base legal | aviso |

`lintModelo(modelo, indice, { legislacao: null })` desliga a conferência.

## Operação

```bash
node ferramentas/legislacao.mjs atualizar          # rebaixa todas; avisa se um artigo citado mudou de texto
node ferramentas/legislacao.mjs atualizar CC LGPD  # só essas
node ferramentas/legislacao.mjs conferir           # toda base legal da semente resolve?
node ferramentas/legislacao.mjs ver "CPC art. 784, III e §4º"
```

Quando rodar `atualizar`: de tempos em tempos (a fonte recoleta sempre), e
sempre que uma cláusula nova citar norma nova. Se o comando avisar
`art. N mudou de texto (cláusula "x")`, alguém relê a cláusula. Commitar os
`.md` e o `fontes.json`: o que está no repo é o que a bula mostra, e a data
de coleta vai junto.

Para citar uma norma que não está no catálogo: acrescentar em
`normas.json` (o `caminho` é o do arquivo em ctresb/leis; a pasta segue
`federal/<tipo>/<ano>/`) e rodar `atualizar <sigla>`. Resoluções do CFM, do
COFEN e de outros conselhos ainda não estão nesse repositório; quando o kit
saúde precisar delas, a origem será outra (o módulo só precisa do Markdown no
mesmo formato: `**Art. N.**`, `**§ N**`, `I -`, `a)`).

## O que não faz

- Não interpreta a lei nem escolhe o artigo: o redator cita, o advogado
  aprova (#11). As seis cláusulas que estavam sem base legal em 21/out
  (obrigações da contratante, confidencialidade, comunicações, objeto e
  devolução do termo do colaborador, ratificação do aditivo) receberam
  citações do redator e **precisam da revisão do advogado** como as demais.
- Não entra no PDF do contrato nem no dossiê (ficaria longo); entra no
  `LEIA-ME.txt` do pacote de prova só a citação.
- Não acompanha jurisprudência nem normas estaduais.
