# Instagram @bullacheck: perfil, conteúdo, postagem e medição

> Escrito em 22/out/2026. MARCA.md diz o que a marca é; este documento diz
> como ela aparece no Instagram, semana a semana. Baseado no que os estudos
> de 2026 mostram para contas pequenas (Reels alcançam, carrosséis engajam,
> conteúdo repostado não é mais recomendado) e no princípio de build in
> public que funciona: gente segue pessoa construindo, não logotipo.

## 1. Três decisões que mandam em tudo

1. **Conta da marca com o rosto do Davi.** O handle é `@bullacheck`, mas quem
   fala é o Davi, na primeira pessoa, e ele aparece em vídeo ao menos uma vez
   por semana. Conta só de logotipo não cresce em build in public; conta
   pessoal confunde quando o produto virar empresa. Cross-post no perfil
   pessoal do Davi é bem-vindo, sempre repostando o próprio conteúdo.
2. **Reels para ser descoberto, carrossel para ser salvo.** Conta com menos de
   mil seguidores alcança não seguidores quase só por Reels. O carrossel
   (que o algoritmo volta a mostrar a quem não interagiu) é onde a pessoa
   salva e volta. Proporção de partida: **metade Reels, 40% carrosséis, 10%
   imagem única ou pergunta**. Revisar em 30 dias com os Insights.
3. **Tudo original e tudo de verdade.** Só tela real, número real, pessoa real.
   Nada de repost, template comprado ou "dica genérica". Além de ser a regra
   do produto, desde abril de 2026 conta que posta conteúdo que não criou
   deixa de ser recomendada a não seguidores.

## 2. O perfil

| Campo | Valor |
|---|---|
| Handle | `@bullacheck` (reserva: `@bullacheck.app`) |
| Nome (campo pesquisável) | **BullaCheck · contrato com bula** |
| Categoria | Software |
| Avatar | `marca/avatar.png` (símbolo em 1080) |
| Bio (≤ 150 caracteres) | Construindo em público um jeito de assinar contrato entendendo o que está assinando. Por Davi, estudante de medicina. Um lançamento por semana. |
| Link | o site; até ter domínio, o GitHub do projeto |
| Destaques (nesta ordem) | **Começo** · **Produto** · **Bastidor** · **Lançamentos** · **Pergunte** (capas em `marca/destaques/`) |
| Posts fixados | 1) post 1 "voltar atrás" · 2) post 2 "o nome" · 3) o primeiro Reel mostrando a bula na tela |

O que vai em cada destaque:

- **Começo**: os stories do primeiro dia, a origem (contrato de médico PJ que
  ninguém lia), o nome.
- **Produto**: tela de assinatura, a bula, "o que diz a lei", o selo com QR.
- **Bastidor**: commits, testes quebrando, decisões, o que deu errado.
- **Lançamentos**: um story por versão (v0.10, v0.11…), com data e o que
  provou. É o CHANGELOG em stories.
- **Pergunte**: respostas às caixinhas, dúvidas de quem assina contrato.

## 3. Grade

- Três colunas, e a leitura é por linha. Alternar: carrossel branco · Reel
  com tela · carrossel com marca-texto grande. Nunca três iguais seguidos.
- Capa de Reel sempre com texto no terço de cima e o símbolo no rodapé, para
  ler na grade (`marca/reels/<n>/capa.png`).
- Fundo branco predominante, como o produto. O azul só no símbolo e em
  destaques; o amarelo só no marca-texto. A grade tem que parecer o site.

## 4. Formatos

### Reel (metade do volume)

Duração 15 a 40 s, vertical 1080×1920, legendas queimadas no vídeo (a
maioria assiste sem som), gancho falado ou escrito nos primeiros 2 s, sem
intro. Quatro receitas, revezadas:

| Receita | Como | Exemplo |
|---|---|---|
| **Tela gravada** | gravação do celular ou do painel, zoom no que importa, texto na tela e voz do Davi | "Olha o que acontece quando a pessoa clica em 'tenho uma dúvida'" |
| **Rosto, 20 s** | Davi, câmera do celular, luz de janela, uma ideia só | "Construí 9 etapas em 4 dias e nenhuma foi validada. Esta semana vou corrigir isso." |
| **Antes e depois** | contrato no Word à esquerda, a mesma cláusula com bula à direita | "Cláusula 7 no Word. Cláusula 7 com bula." |
| **Número do dia** | um número grande na tela e a explicação em 15 s | "166 testes. 0 pessoas. Esse é o problema." |

Áudio: voz própria ou som original baixo. Sem trend de dança, sem música
licenciada que a conta comercial não pode usar.

### Carrossel (40%)

1080×1350, 5 a 7 slides, gerado por `ferramentas/post.mjs` na identidade do
produto. Estrutura fixa:

1. **Gancho** em até 8 palavras, marca-texto na palavra que importa.
2. **Promessa ou contexto** em uma frase.
3. a 5. **Um ponto por slide**, com print real quando houver.
6. **Fecho**: o que vem + pergunta.

Texto mínimo de 28 px no slide (lê no celular). Alt text em todo slide (o
campo "texto alternativo" ao publicar): descreve a tela, não repete o título.

### Imagem única e pergunta (10%)

Uma frase com marca-texto, fundo branco. Serve para pergunta ao público e
para registrar uma decisão ("Nome decidido: BullaCheck").

### Stories (todo dia, 2 a 4)

Sem edição: foto do notebook, trecho de teste rodando, enquete, caixinha,
repost de comentário bom. É aqui que o build in public acontece de verdade;
o feed é o resumo. Toda sexta: enquete "o que eu testo semana que vem?".

## 5. Legenda, hashtags e alt text

- **Primeira linha é o gancho** (até 125 caracteres, antes do "mais"). Não
  começar com "Hoje eu…" nem com emoji.
- 3 a 6 linhas, primeira pessoa, parágrafos curtos, uma pergunta no fim.
- **Hashtags**: 3 a 5, no fim da legenda (em 2026 o primeiro comentário não
  dá vantagem). Mistura de nicho e tema: `#buildinpublic #saas #contratos
  #lgpd #clinicas`. Nada de 30 hashtags.
- Mencionar `@` só de quem participou (advogado, clínica), com autorização.
- Alt text sempre.

### Banco de ganchos

Escritos para a primeira linha ou para o slide 1. Usar e variar.

1. Construí um sistema de contratos em 4 dias. Agora vou voltar atrás.
2. Você leu o último contrato que assinou?
3. Um contrato de médico PJ tem 15 cláusulas. Ninguém lê a 7.
4. "Li e concordo" é a mentira mais assinada do Brasil.
5. O que acontece quando a pessoa não entende a cláusula e assina mesmo assim.
6. Isso aqui entrou ontem: o artigo da lei embaixo de cada cláusula.
7. 166 testes passando. 0 pessoas de fora usaram. Esse é o problema.
8. Três rodadas, doze nomes rejeitados. Esse ficou.
9. O primeiro link que saiu da minha máquina.
10. Pedi para 10 pessoas lerem um contrato. Só 3 entenderam a multa.
11. Contrato com bula: o remédio explica, por que o contrato não?
12. O que uma clínica faz hoje para contratar um médico PJ (spoiler: Word e e-mail).
13. O erro que eu cometi por construir rápido demais.
14. Essa cláusula tem destaque por lei. Quase ninguém faz isso.
15. Como provar que a pessoa leu, não só assinou.
16. O selo que qualquer um confere pelo QR, sem conta.
17. A funcionalidade que ninguém pediu e eu fiz mesmo assim (e vou desligar).
18. Se você assina contrato pela empresa, isso aqui é para você.
19. Esta semana reprovou. Aqui está o que eu volto a fazer.
20. Sem ler a bio: o que você acha que o BullaCheck faz?

## 6. Calendário semanal e horários

| Dia | Formato | Pilar | Observação |
|---|---|---|---|
| Segunda | Reel (rosto ou número) | O que vem | a hipótese da semana, 20 s |
| Quarta | Carrossel | Diário de construção | o que entrou, com print |
| Sexta | Reel (tela gravada ou antes/depois) | Produto ou problema | o que a pessoa vê |
| Sábado (quinzenal) | Imagem única | Pergunta ao público | alimenta a caixinha |
| Todo dia | 2 a 4 stories | Bastidor | sexta: enquete da semana seguinte |

**Horário**: os estudos de 2026 para o Brasil divergem; o consenso parcial é
terça a quinta, 9h às 12h, com um segundo pico 18h às 21h. Hipótese de
partida: **feed às 11h, Reel de sexta às 18h30, stories ao longo do dia**.
Depois de 4 semanas, abrir Insights → Público → "horários mais ativos" e
ajustar. O horário certo é o da nossa conta, não o do artigo.

Produzir em lote: domingo à tarde grava os dois Reels da semana e gera o
carrossel com `post.mjs`; durante a semana só publica e responde.

## 7. Engajamento: o que fazer depois de publicar

- **Primeira hora**: ficar no app. Responder todo comentário com uma
  pergunta de volta, não com "obrigado". Comentário de desconhecido vale o
  dobro: responder e visitar o perfil.
- **Antes de publicar**: 15 minutos comentando com substância em 5 perfis do
  entorno (clínicas, RH de saúde, contadores, advogados que falam de contrato,
  outros fundadores build in public). Não "ótimo post": uma frase que mostra
  que leu.
- **DM**: quem comenta duas vezes recebe uma mensagem pessoal perguntando o
  que faz. É daí que saem os 10 leitores do teste de compreensão (v0.12) e as
  clínicas do piloto.
- **Collab**: quando houver advogado revisor (#11) ou clínica piloto, post em
  colaboração (aparece nos dois perfis). Só com autorização escrita.
- Nunca comprar seguidor, nunca grupo de engajamento, nunca responder com
  bot. Numa conta que vende confiança isso é fatal.

## 8. Medir (toda segunda, 10 minutos)

Planilha `marca/metricas.csv` (uma linha por semana):

| Métrica | Onde | Por quê |
|---|---|---|
| Alcance de **não seguidores** por Reel | Insights do Reel | é a descoberta |
| Salvamentos e compartilhamentos por carrossel | Insights do post | é o valor percebido |
| Comentários de desconhecidos | contar à mão | é a validação de v0.10 |
| Cliques no link | Insights do perfil | é o funil para o site |
| DMs recebidas e respondidas | caixa de entrada | é o piloto nascendo |
| Seguidores | perfil | o menos importante dos seis |

Metas de hipótese (não de vaidade), para revisar com dados:

| Prazo | Hipótese |
|---|---|
| 30 dias (até 22/nov) | 12 posts no ar; 3 Reels acima de 1.000 contas alcançadas; 20 comentários de desconhecidos; 10 pessoas recrutadas para o teste de compreensão |
| 60 dias | um post com mais de 100 salvamentos; 3 clínicas ou RHs em DM; o advogado revisor encontrado pelo perfil ou por quem o perfil trouxe |
| 90 dias | o piloto (v1.0) contado em público, com números |

Se em 30 dias os Reels de rosto alcançarem mais que os de tela, inverte a
proporção. Se o carrossel não for salvo, encurta para 5 slides. Decidir com
Insights, registrar a decisão no CHANGELOG.

## 9. Regras e cuidados

- Nenhum contrato, nome ou logotipo de cliente sem autorização escrita. Os
  prints usam a organização de exemplo (Clínica Exemplo).
- Não afirmar validade jurídica além do que VALIDADE-JURIDICA.md diz, e dizer
  que os modelos ainda não passaram por advogado até #11 fechar.
- Não prometer data de lançamento. "Próximo lançamento" e o que ele testa.
- Quando reprovar, postar a reprovação. É o conteúdo mais forte que existe
  em build in public, e é a regra do ROTEIRO.
- Dados pessoais de quem comenta ou manda DM não viram conteúdo.

## 10. Calendário dos primeiros 30 dias

| Data | Dia | Formato | Título ou gancho | Material |
|---|---|---|---|---|
| 27/out | seg | Carrossel (fixado) | Construí um sistema de contratos em 4 dias. Agora vou voltar atrás. | `marca/posts/001-voltar-atras/` ✅ |
| 27/out | seg | Stories | primeiro dia: notebook, o repo, a caixinha "o que você não entendeu no último contrato?" | ✅ no legenda.md |
| 29/out | qua | Carrossel (fixado) | Sem ler a bio: o que você acha que o BullaCheck faz? | `marca/posts/002-nome/` ✅ |
| 31/out | sex | Reel tela gravada | Isso aqui entrou ontem: o artigo da lei embaixo de cada cláusula | roteiro em `marca/reels/001-o-que-diz-a-lei/` ✅ capa; gravar |
| 1/nov | sáb | Imagem | "Li e concordo" é a mentira mais assinada do Brasil. | gerar com `post.mjs` |
| 3/nov | seg | Reel rosto | A hipótese da semana: um link que sai da minha máquina (v0.11) | gravar |
| 5/nov | qua | Carrossel | Você leu o último contrato que assinou? (o problema, com a cláusula 7) | gerar |
| 7/nov | sex | Reel antes/depois | Cláusula 7 no Word. Cláusula 7 com bula. | gravar |
| 10/nov | seg | Reel rosto | O primeiro link que saiu da minha máquina: deu certo? (resultado de v0.11) | gravar |
| 12/nov | qua | Carrossel | Como provar que a pessoa leu, não só assinou (dossiê, ciência, selo) | gerar |
| 14/nov | sex | Reel tela | O selo que qualquer um confere pelo QR, sem conta | gravar |
| 15/nov | sáb | Imagem/pergunta | Quero 10 pessoas para ler um contrato e responder 5 perguntas. Topa? (recruta v0.12) | gerar |
| 17/nov | seg | Reel rosto | A hipótese da semana: 10 leitores, 5 perguntas | gravar |
| 19/nov | qua | Carrossel | O que uma clínica faz hoje para contratar um médico PJ | gerar |
| 21/nov | sex | Reel número | 10 pessoas leram. X entenderam a multa. (resultado de v0.12) | gravar |
| 24/nov | seg | Reel rosto | Esta semana reprovou (ou passou): o que eu volto a fazer | gravar |
| 26/nov | qua | Carrossel | Três rodadas, doze nomes rejeitados: como escolhi o nome | gerar |

Cada post sai de uma pasta `marca/posts/NNN-slug/` (carrossel e imagem) ou
`marca/reels/NNN-slug/` (roteiro, capa, legenda). O changelog aponta o link
do post de cada versão.

## Checklist antes de publicar

- [ ] Gancho na primeira linha e no slide 1 (≤ 8 palavras no slide)
- [ ] Print ou vídeo real, da organização de exemplo
- [ ] Alt text em cada slide
- [ ] Legenda com pergunta no fim e 3 a 5 hashtags
- [ ] Capa do Reel com texto no terço de cima
- [ ] Nada de nome de cliente, data prometida ou "validade garantida"
- [ ] Horário do teste (11h feed, 18h30 Reel de sexta)
- [ ] Agenda bloqueada: 60 minutos no app depois de publicar
