# Roteiro: etapas, validação e lançamentos

> Escrito em 21/out/2026. O produto foi construído em quatro dias de código
> (45 commits entre 16 e 21/out) antes de qualquer pessoa de fora usar. Este
> documento **volta atrás de propósito**: divide o que existe em etapas,
> diz o que cada uma precisa provar, e fixa como novas atualizações passam
> a ser lançadas e validadas uma a uma, em público.

## 1. A regra daqui para frente

Uma etapa só "fecha" quando alguém de fora a usou e a pergunta dela foi
respondida. Código pronto não é etapa pronta. Cada lançamento tem:

| Passo | O quê | Prova |
|---|---|---|
| 1. Hipótese | Uma frase: "se X, então Y" | linha no CHANGELOG |
| 2. Construção | O menor pedaço que testa a hipótese | commits, issue fechada |
| 3. Portão técnico | `npm test`, `npm run build`, `node src/cli.js lint`, `node ferramentas/legislacao.mjs conferir`, screenshot 390 e 1440 sem vazamento | CI verde + shots |
| 4. Versão | tag `vX.Y` e entrada no CHANGELOG com data (v0.1 é o primeiro lançamento público) | `git tag` |
| 5. Validação com gente | quem, quantos, qual pergunta, qual resultado conta como "passou" | nota de validação no CHANGELOG |
| 6. Post | o que fizemos, o que aprendemos, o que vem (Instagram, ver MARCA.md) | link do post |
| 7. Decisão | segue, ajusta ou volta | próxima hipótese |

Cadência: **um lançamento por semana**, pequeno. Se a validação reprova, a
semana seguinte é ajuste, não feature nova.

## 2. O que já existe, dividido em etapas (retroativo)

Cada etapa abaixo tem o código pronto. A coluna "validação" é o que ainda
falta para ela fechar de verdade. "Volta" é o que fazemos se reprovar.

| # | Etapa | Hipótese | Validação (quem, pergunta, passa se) | Estado |
|---|---|---|---|---|
| E1 | **Motor**: modelo como lógica, linter, PDF | Um revisor sem programar escreve um modelo que gera contrato certo para PF, PJ e MEI | 1 revisor (estagiário de direito) cria um modelo no painel em até 2 h sem ajuda; o linter pega os erros que ele comete | código ✅ · validação ⏳ |
| E2 | **Assinatura com bula**, selo e dossiê | Quem lê o resumo entende a cláusula sem ajuda | 10 pessoas leigas assinam um contrato de exemplo no celular; depois respondem 5 perguntas sobre o que assinaram; passa com 8/10 acertando 4+ | código ✅ · validação ⏳ |
| E3 | **Lote** pela planilha do RH | O RH prefere planilha a digitar 40 contratos | 1 RH de clínica sobe a planilha real (anonimizada) e envia; passa se chega ao fim sem suporte | código ✅ · validação ⏳ |
| E4 | **Plataforma e painel** | Um admin de clínica se vira sozinho no painel | 1 admin faz: criar contrato, enviar, ver status, baixar dossiê; cronometrado; passa se < 10 min sem perguntar | código ✅ · validação ⏳ |
| E5 | **Contrato vivo**: vigência, agenda, reajuste, aditivo, distrato | A clínica quer ser avisada antes do vencimento | 1 admin e 1 contador olham a agenda e o reajuste; passa se dizem "eu usaria" sem ressalva de cálculo | código ✅ · validação ⏳ |
| E6 | **Plugáveis**: carimbo do tempo, ICP-Brasil | Clínica pequena não exige ICP para contrato PJ | pergunta ao advogado e a 2 clínicas; passa se ninguém exige para o piloto | código ✅ · validação ⏳ |
| E7 | **Identidade**: bula nas telas, fé pública no PDF, site | Em 5 segundos a pessoa diz o que o produto faz | 10 pessoas veem o site por 5 s e respondem "o que isso faz?"; passa com 7/10 citando "contrato" + "entender/explicar" | código ✅ · validação ⏳ |
| E8 | **Operação**: Supabase, CI, backup, avisos, diretório de pessoas, marca da org, exportação, demonstração | O sistema roda uma semana sem o dev tocar | 7 dias no ar com domínio real, 0 incidentes sem aviso | depende de #5 e #6 · ⏳ |
| E9 | **Legislação**: "o que diz a lei" na bula, linter conferindo artigo | Mostrar o artigo aumenta confiança sem assustar | nas 10 leituras de E2, medir quantos abrem "o que diz a lei" e perguntar se ajudou; passa se ninguém diz que atrapalhou | código ✅ · validação ⏳ |

Leitura honesta: temos nove etapas de código e **zero validadas**. É por
isso que a ordem abaixo começa pelo que destrava validação, não por feature.

## 3. Próximos lançamentos (ordem proposta)

| Versão | Semana | Lançamento | Hipótese | Validação |
|---|---|---|---|---|
| v0.1 | 27/out a 2/nov | **Primeiro lançamento público**: nome e marca, domínio, e-mail real (#5), hospedagem (#6). Plano dia a dia em [LANCAMENTO-v0.1.md](LANCAMENTO-v0.1.md) | Um link chega e é assinado por alguém longe | 3 amigos assinam de casa, pelo celular, sem instrução por telefone |
| v0.2 | 10/nov | **Teste de compreensão da bula** (fecha E2 e E9) | ver E2 | 10 leitores, 5 perguntas |
| v0.3 | 17/nov | **Gerador público de contratos** no site: formulário a partir do modelo, PDF e DOCX | Quem gera um contrato de graça volta para assinar | 20 contratos gerados; 3 pedem "enviar para assinar" |
| v0.4 | 24/nov | **Kit saúde v1** (#2–#4), depende da IMAGO (#1) | O modelo médico PJ cobre o que a clínica faz hoje | a IMAGO compara com o contrato atual e lista o que falta |
| v0.5 | 1/dez | **Revisão do advogado** (#11) e termo de uso (#12) | Os modelos podem ser usados de verdade | advogado aprova e publica os modelos pelo painel |
| v1.0 | dez | **Piloto** na IMAGO (#7) | A clínica troca o Word pelo produto | 10 contratos reais assinados no mês |

Tudo que entrar fora dessa lista (onda 3 do ESTUDO: importador .docx,
papéis, plano Rede, cobrança) espera o piloto, salvo se uma validação pedir.

## 4. Versões e changelog

- `CHANGELOG.md` na raiz, uma seção por versão, com data, hipótese, o que
  entrou, resultado da validação e link do post.
- Tag git por versão (`v0.1`, `v0.2`…), só para lançamentos públicos. As
  etapas retroativas E1–E9 têm as tags `etapa-1`…`etapa-9` apontando para o
  último commit de cada uma.
- Issues no GitHub continuam sendo a lista de pendências; cada lançamento
  cita as issues que fecha.

## 5. O que "voltar atrás" significa aqui

Não é apagar código. É aceitar que uma etapa pode ser **simplificada ou
desligada** se a validação disser que não importa agora. Candidatos a
desligar até o piloto, se ninguém pedir: carimbo do tempo e ICP (E6), lote
(E3), reajuste pelo índice (E5). Tudo fica no repositório; o que some é do
menu e do discurso.

## 6. Quem faz o quê

- **Davi**: decide nome e marca, grava e publica os posts, conduz as
  validações com gente (IMAGO, amigos, contador, advogado), compra domínio.
- **Dev (Claude)**: constrói o lançamento da semana, passa o portão
  técnico, escreve CHANGELOG e o rascunho do post, prepara os roteiros de
  validação (perguntas, planilha de resultados).
- **Revisores e advogado**: entram em v0.14 e v0.15 (ATUACAO.md, seção 9).
