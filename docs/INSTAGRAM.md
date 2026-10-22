# Instagram @bullacheck: perfil, conteúdo, postagem e medição

> Escrito em 22/out/2026. MARCA.md diz o que a marca é; este documento diz
> como ela aparece no Instagram, semana a semana. Baseado no que os estudos
> de 2026 mostram para contas pequenas (Reels alcançam, carrosséis engajam,
> conteúdo repostado não é mais recomendado) e no princípio de build in
> public que funciona: gente segue pessoa construindo, não logotipo.

## 0. A voz (revisada em 22/out)

Decisão do Davi: **simples, sem emoji, sem diário**. O perfil mostra o
sistema e os avanços, não a rotina de quem constrói.

- O primeiro post apresenta o projeto. Daí em diante, **cada avanço vira um
  post quando sai**: o que entrou, o que faz, uma tela de verdade. Não se
  conta o que já estava feito; conta-se o que mudou.
- Frase curta, em caixa normal, sem gíria forçada e sem emoji. Primeira
  pessoa quando for decisão ("estou construindo", "o próximo é"), terceira
  quando for o produto ("cada cláusula vem com um resumo").
- O número entra quando muda a leitura (15 cláusulas, 10 leis). Sem
  contagem de commits ou testes como enfeite.
- Tela real sempre, em alta resolução (prints em 3x, slides em 2x). As
  cores do produto (branco, azul, amarelo do marca-texto) são a identidade
  do perfil; não introduzir outras.
- Fecho de cada post: o que vem a seguir, em uma frase. Sem pedir
  comentário a cada post; a pergunta entra só quando é uma validação de
  verdade (teste de nome, recrutar leitores).
- O que não muda: as regras da seção 9 (nada de cliente real, nada de
  promessa jurídica além do documentado).

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
| Bio (≤ 150 caracteres) | Contrato com bula: a pessoa entende o que está assinando. Construindo em público; cada avanço vira um post. Por Davi. |
| Link | o site; até ter domínio, o GitHub do projeto |
| Destaques (nesta ordem) | **Começo** · **Produto** · **Bastidor** · **Feedbacks** · **Lançamentos** (capas em `marca/destaques/`) |
| Posts fixados | 1) a apresentação · 2) o avanço mais recente |

O que vai em cada destaque:

- **Começo**: a apresentação, a origem (contrato de médico PJ que ninguém
  lia) e o nome.
- **Produto**: tela de assinatura, a bula, "o que diz a lei", o selo com QR.
- **Bastidor**: commits, testes quebrando, decisões, o que deu errado.
- **Lançamentos**: um story por versão (v0.10, v0.11…), com data e o que
  provou. É o CHANGELOG em stories.
- **Feedbacks**: print de comentário, DM e caixinha de quem opinou (com
  autorização e sem dado pessoal). Quando houver gente usando, vira o
  "flagras" da casa.

## 3. Grade

- Três colunas, e a leitura é por linha. Alternar: carrossel branco · Reel
  com tela · carrossel com marca-texto grande. Nunca três iguais seguidos.
- Capa de Reel sempre com texto no terço de cima e o símbolo no rodapé, para
  ler na grade (`marca/reels/<n>/capa.png`).
- Fundo branco predominante, como o produto. O azul só no símbolo e em
  destaques; o amarelo só no marca-texto. A grade tem que parecer o site.

## 4. Tipos de post e formato

| Tipo | Quando | Exemplo |
|---|---|---|
| **Apresentação** | uma vez, fixado | o que é o BullaCheck, em 6 slides |
| **Avanço** | a cada lançamento (ver ROTEIRO.md) | "O primeiro contrato enviado para alguém de fora" |
| **Resultado** | quando uma validação termina | "10 pessoas leram um contrato com bula; 8 entenderam a multa" |
| **Decisão** | quando algo muda de rumo | "Desliguei o carimbo do tempo até o piloto" |

Formato padrão: **carrossel 1080×1350 em 2x**, 4 a 6 slides, gerado por
`ferramentas/post.mjs` na identidade do produto: slide 1 diz o avanço em uma
frase; slides seguintes, um ponto por slide com a tela real ao lado (prints
em 3x, `ferramentas/shots/prints-apresentacao.mjs` é o modelo); último slide,
o próximo passo. Texto mínimo de 30 px no slide. Alt text em todo slide.
Reel de tela gravada (15 a 30 s, legenda queimada, sem trilha) quando o
avanço é melhor mostrado em movimento. Stories só com tela nova ou resultado.

## 5. Legenda, hashtags e alt text

- **Primeira linha é o gancho** (até 125 caracteres, antes do "mais"), na
  voz da seção 0: minúscula, curta, com o erro ou o número na cara.
- 3 a 6 linhas, primeira pessoa, parágrafos curtos, uma pergunta no fim.
- **Hashtags**: 3 a 5, no fim da legenda (em 2026 o primeiro comentário não
  dá vantagem). Mistura de nicho e tema: `#buildinpublic #saas #contratos
  #lgpd #clinicas`. Nada de 30 hashtags.
- Mencionar `@` só de quem participou (advogado, clínica), com autorização.
- Alt text sempre.

### Primeiras linhas (banco)

1. BullaCheck: contrato com bula.
2. O primeiro contrato enviado para alguém de fora.
3. Cada cláusula vem com um resumo em palavras simples.
4. O artigo da lei embaixo de cada cláusula.
5. Dez pessoas leram um contrato com bula. Este foi o resultado.
6. O selo que qualquer pessoa confere pelo QR.
7. Como uma clínica contrata um médico PJ hoje, e como fica com bula.
8. Desliguei uma função que ninguém pediu.
9. O modelo médico PJ, revisado por advogado.
10. O que mudou esta semana.

## 6. Ritmo e horários

Um post por avanço, no dia em que o avanço sai (ROTEIRO.md: um lançamento
por semana, então cerca de um post por semana). Formato: carrossel de 4 a 6
slides com tela real; Reel de tela gravada quando o avanço é melhor
mostrado em movimento (sem rosto obrigatório, sem trilha, legenda queimada).
Stories só quando houver tela nova ou resultado; sem rotina.

**Horário**: os estudos de 2026 para o Brasil divergem; consenso parcial é
terça a quinta, 9h às 12h, com segundo pico 18h às 21h. Hipótese de
partida: **11h**. Depois de 4 semanas, abrir Insights → Público → "horários
mais ativos" e ajustar.

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

## 10. Sequência de posts

| # | Tipo | Título | Quando |
|---|---|---|---|
| 1 | Apresentação | BullaCheck: contrato com bula | ao abrir a conta (`marca/posts/001-apresentacao/`, pronto) |
| 2 | Avanço | O primeiro contrato enviado para alguém de fora | quando v0.11 sair (domínio, e-mail real) |
| 3 | Resultado | Dez pessoas leram um contrato com bula | quando v0.12 terminar |
| 4 | Avanço | Gere o contrato no site e receba em PDF | quando v0.13 sair |
| 5 | Avanço | O modelo médico PJ, revisado por advogado | quando v0.14/v0.15 saírem |
| 6 | Resultado | O piloto | v1.0 |

Entre um lançamento e outro, se um avanço menor merecer post (uma tela
nova, uma função), ele entra como "Avanço" de 4 slides. Cada post sai de
`marca/posts/NNN-slug/` com `post.html`, prints e `legenda.md`.

## Checklist antes de publicar

- [ ] Primeira linha diz o avanço em uma frase; slide 1 idem
- [ ] Print ou vídeo real, da organização de exemplo
- [ ] Alt text em cada slide
- [ ] Legenda curta, sem emoji, com o próximo passo no fim e 3 hashtags
- [ ] Nada de nome de cliente, data prometida ou "validade garantida"
- [ ] Horário do teste (11h)
- [ ] Agenda bloqueada: 60 minutos no app depois de publicar
