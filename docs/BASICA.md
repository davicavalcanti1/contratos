# Versão básica: o que entra, o que se esconde, e por quê

> Escrito em 22/out/2026, depois de duas rodadas de entrevista com o Davi.
> Este documento é o plano completo da **versão básica** do BullaCheck.
> Nada de código muda antes do "ok" do Davi neste arquivo. Depois do ok,
> ele passa a valer mais do que ROTEIRO.md e LANCAMENTO-v0.1.md onde
> houver conflito.

## 0. Leitura honesta (o que a entrevista revelou)

- O produto, visto de fora, é **assinatura eletrônica com resumo em
  linguagem simples**. Isso é funcionalidade, não produto. Clicksign,
  ZapSign, D4Sign e Autentique fazem o resto igual, dois deles de graça.
- A **única dor ouvida de um cliente real** (IMAGO) é: "demora esperar o
  funcionário assinar; eletrônico seria mais simples". É a dor commodity.
  Ninguém pediu bula, dossiê ou prova de compreensão.
- A tese "o dossiê protege contra pejotização" **não foi validada por
  advogado**. Na Justiça do Trabalho vale a primazia da realidade (CLT
  art. 9º). Até um advogado dizer o contrário, o site não promete proteção.
- O BullaCheck entra na IMAGO porque o Davi está lá e eles confiam nele.
  É vantagem de distribuição, não de produto. O que faz a segunda clínica
  comprar ainda não existe e só aparece observando a IMAGO usar.
- Construímos nove etapas de código com zero usuários. A versão básica
  não é "o que construir primeiro"; é **o que esconder** para o produto
  caber na mão de uma clínica e ser medido.

## 1. Meta, prazo, limites

| | |
|---|---|
| **Meta em 90 dias** (até 20/jan/2027) | **100 documentos assinados** por pessoas reais (contrato PJ ou termo de sigilo, cada um conta). Uma clínica usando e **uma frase dela** que dê para pôr no site |
| **Cliente 1** | IMAGO: cerca de 120 funcionários e 40 médicos. Só o termo de sigilo para a casa inteira já é mais da meta |
| **Tempo do Davi** | 10 h/semana até 15/nov; integral depois. Até 15/nov o Davi **vende e valida**, não constrói |
| **Dinheiro** | R$ 1.500 no período. Domínio (~R$ 40), hospedagem já existe (Hostinger + EasyPanel), advogado (amigos, de graça, **com data marcada**). **Sem anúncio** até existir um caso real para mostrar; o que sobrar fica para janeiro |
| **Promessa do site** | "Contratos que a sua equipe entende e assina em minutos." Vende velocidade (a dor ouvida) com a bula como diferença de experiência. **Não** promete "vale em juízo", "você consegue provar" nem proteção trabalhista até o advogado liberar |
| **Modo de entrada na IMAGO** | **Serviço antes de software**: nas primeiras semanas o Davi senta com o RH, sobe a planilha junto e envia pela conta da clínica. Anota o que trava |

## 2. Princípios do corte

1. **Esconder, não apagar.** Tudo que sai fica no repositório e nos testes.
   Some do menu, das rotas públicas e do discurso. Volta quando alguém pedir.
2. **Um interruptor só.** Variável `EDICAO=basica` no servidor. O servidor
   expõe em `/eu` (e na página pública) um objeto `edicao` com o que está
   ligado; menu, rotas do painel, seções do site e bloco de lei leem dali.
   Sem a variável, tudo continua como hoje (desenvolvimento e demonstração).
3. **Só o que a IMAGO precisa para assinar e acompanhar.** Critério de
   dúvida: "o RH da IMAGO vai clicar nisso nas primeiras duas semanas?".
   Se não, sai.
4. **Nada escrito por mim com cara de parecer jurídico aparece para quem
   assina** até o advogado revisar. Isso tira "O que diz a lei" e os textos
   de validade jurídica do site.
5. **Medir antes de melhorar.** A básica mede quatro coisas (seção 6). A
   versão seguinte nasce da medida, não de ideia.

## 3. O que fica, tela por tela, campo por campo

### 3.1 Site público `/`

Uma página só, cinco blocos, nada de cadastro aberto.

| Bloco | Conteúdo | Muda em relação a hoje |
|---|---|---|
| Cabeçalho | Marca, link "Entrar" (painel), link discreto "Conferir um contrato" | Somem do menu os links Recursos, Como funciona, Validade jurídica, Para quem e Segurança (`/seguranca` continua existindo, linkada no rodapé) |
| Abertura | Título: "O contrato que quem assina entende." Subtítulo novo: "Envie pelo celular, a pessoa lê com a bula e assina em minutos. Sem imprimir, sem esperar." Botão único: **"Falar com a gente"** (WhatsApp do Davi, `wa.me`) | Somem "Receber um contrato de teste" e a seção `#experimentar` inteira (a demonstração por e-mail fica desligada: `api/demo/*` responde 404 na básica) |
| A bula ao vivo | A demonstração que já existe na página: três cláusulas com "Li e entendi" e o botão Assinar que destrava | Fica igual; é o que faz a pessoa entender em 5 segundos |
| Como funciona | Três passos: você gera (ou sobe a planilha), a pessoa lê com a bula no celular, o PDF sai selado com o registro de quem leu o quê | Fica; texto encurtado |
| Para quem | Um parágrafo: "Clínicas, consultórios e empresas que contratam PJ e precisam que toda a equipe assine termo de sigilo." | Somem os quatro cartões (RH, advocacia, imobiliária, sistemas) |
| Rodapé | "Os modelos disponíveis ainda não passaram por revisão de advogado." Links: Segurança, Conferir um contrato, Instagram | Frase obrigatória enquanto #11 estiver aberta |

Somem: seção Recursos (oito cartões, inclusive API, ICP, contrato vivo),
seção "O modelo é lógica" (PF/PJ/MEI/com erros), seção "Vale em juízo, e
você consegue provar", seção "O que o produto não faz". `/seguranca` fica,
reescrita para dizer só o que é verdade na básica (sem carimbo do tempo,
sem ICP; dados no Supabase, e-mail pelo Resend, retenção).

### 3.2 Entrar, redefinir senha, convite, minha conta

Ficam como estão. Campos: e-mail, senha; "esqueci a senha" manda link;
convite por e-mail cria senha. Minha conta: nome, trocar senha.

### 3.3 Painel: menu

Na básica, o menu da organização tem:

| Item | Rota | Quem vê |
|---|---|---|
| Visão geral | `/inicio` | todos |
| Contratos | `/contratos` | todos |
| Lotes | `/lotes` | todos |
| Pessoas | `/pessoas` | todos |
| Leitura | `/leitura` | todos |
| Administração: Dados da empresa, Usuários | `/empresa`, `/usuarios` | admin |

Somem do menu e das rotas: **Modelos** (`/modelos`), **Agenda**,
**Chaves de API**, **Webhooks**. O developer continua vendo o grupo
Plataforma inteiro (Organizações, Biblioteca, Interessados, Leitura, Saúde,
Auditoria); ninguém da IMAGO é developer.

### 3.4 Visão geral `/inicio`

É o "painel para acompanhar" que o Davi pediu. Fica com:

- Saudação e resumo do dia (quantos aguardando, quantos expirando, dúvidas abertas).
- Números: enviados, assinados, aguardando, recusados. **Some o medidor
  "uso do plano"** (não há plano).
- Cartão "Precisa de atenção": contratos parados, com reenviar direto da lista.
- Cartão "Lotes em andamento": nome do lote, N de M assinados, link.
- Cartão "Últimos contratos".
- **Some** "Próximos 30 dias" (depende da agenda, que sai).
- "Comece por aqui" fica, com dois caminhos: "Enviar um contrato" e
  "Enviar para várias pessoas pela planilha".

### 3.5 Contratos `/contratos` e novo contrato `/contratos/novo`

Lista: título, pessoa, situação, data, filtro por situação, busca. Fica.

Novo contrato, de cima para baixo:

1. **Modelo**: dois cartões só. "Contrato de prestação de serviços" e
   "Termo de sigilo e proteção de dados do colaborador". Aditivo e distrato
   ficam despublicados na biblioteca (não aparecem).
2. **Contratado / Colaborador**: busca no diretório de pessoas (nome, CPF,
   CNPJ, e-mail) ou preenchimento. Campos do modelo de serviços: tipo
   (PF, PJ, MEI), nome ou razão social, CPF, CNPJ (se PJ/MEI), endereço,
   e-mail, representante e CPF do representante (se PJ). Nacionalidade,
   estado civil e profissão **viram opcionais** (hoje atrapalham quem só
   quer mandar rápido). Campos do termo: nome, CPF, e-mail, cargo,
   matrícula (opcional).
3. **Contrato** (só no modelo de serviços): objeto, valor, forma de
   pagamento (mensal ou única), dia do pagamento (padrão 10), prazo
   (determinado ou indeterminado), data de início, duração em meses, aviso
   prévio (padrão 30), multa (padrão 20%), comarca do foro. **Some o índice
   de reajuste** do formulário (fica no modelo com padrão IPCA; o reajuste
   automático está desligado).
4. **Prévia**: "Ver como vai ficar". Fica.
5. **Quem assina**: a pessoa (e-mail obrigatório) e quem assina pela
   empresa (vem dos dados da empresa; pode trocar). Método de assinatura
   **fixo em e-mail com código**; o seletor ICP-Brasil some.
6. **Envio**: prazo em dias (padrão 30). Botão "Gerar e enviar para
   assinatura".

### 3.6 Detalhe do contrato `/contratos/:id`

Fica: título, situação, botões **PDF do contrato / PDF assinado** e
**Dossiê de provas**. Seções: Quem assina (status por pessoa, reenviar),
Dúvidas do signatário (responder), Selo e integridade (código, link do
selo), Dados preenchidos, Histórico. Cancelar contrato fica.

Somem: botão **Pacote .zip**, botão **carimbo .tsr**, ações **Aditivo** e
**Distrato**, bloco de vida do contrato (vigência, reajuste).

### 3.7 Lotes `/lotes`, novo lote, lote

É o caminho das 100 assinaturas. Fica inteiro, com um ajuste:

- Novo lote, passo 1: modelo (os mesmos dois) e planilha (arrastar
  `.xlsx`/`.csv`). Link para baixar **uma planilha de exemplo por modelo**
  (hoje só existe a de funcionários em `/dev`; passa a ser servida aqui,
  sem depender de `/dev`).
- Passo 2: "De onde vem cada campo" (mapeamento sugerido, ajustável).
- Passo 3: conferência linha a linha, quem assina pela empresa, prazo,
  botão "Gerar e enviar N contratos".
- Lote: andamento, filtro por situação, "Lembrar N pessoas", relatório
  CSV. Fica.

### 3.8 Pessoas `/pessoas`

Diretório de quem já assinou ou recebeu. Lista com nome, documento,
e-mail, quantos contratos. Fica como está.

### 3.9 Leitura `/leitura`

É a tela de **medição** da básica. Fica: funil (enviado, abriu, identificou,
leu até o fim, assinou), cláusulas que pedem atenção (onde as pessoas
param, dúvidas, recusas por cláusula), recusas com motivo. Nenhuma mudança.

### 3.10 Dados da empresa `/empresa` e usuários `/usuarios`

Empresa: razão social, CNPJ, endereço, representante e cargo, e-mail do
encarregado de dados, logo. "Como aparece no contrato". **Some o bloco
"Exportar tudo"** (a exportação .zip fica só por CLI). Usuários: convidar
por e-mail, papel (admin ou operador), desativar. Fica.

### 3.11 Página pública de assinatura `/assinar/:token`

O coração. Como hoje:

1. **Identificar**: saudação, "X pediu a sua assinatura como Y", validade
   do link, botão "Enviar código", campo de 6 dígitos, reenviar.
2. **Ler**: o contrato inteiro, cláusulas em destaque com a bula em
   palavras simples e o botão "Li e entendi esta cláusula"; barra de
   progresso; "Próximo destaque" / "Ir para assinatura"; "Tenho uma dúvida"
   em cada cláusula; "Baixar o PDF".
3. **Assinar**: resumo do que foi confirmado, nome como está no contrato,
   caixa "concordo", caixa de localização (opcional), botão "Assinar
   contrato". "Não quero assinar" com cláusula e motivo.
4. **Fim**: código de verificação, link do selo, PDF assinado por e-mail.

Somem: **"O que diz a lei"** em cada cláusula (volta depois de #11) e o
caminho **ICP-Brasil** (baixar PDF, assinar fora, subir).

Cláusulas em destaque na básica: serviços = autonomia, multa, limitação de
responsabilidade, assinatura eletrônica, foro; termo = sigilo, uso dos
recursos, descumprimento, assinatura eletrônica. Os resumos simples dessas
nove cláusulas são **relidos pelo Davi e por um leigo** antes da subida.

### 3.12 Selo `/v/:codigo` e `/verificar`

Fica: código, nome do emissor, título, data, hash do PDF, conferir um PDF
arrastando. Sem menção a carimbo do tempo.

### 3.13 Plataforma (developer)

Fica tudo, só o Davi e eu vemos. Na biblioteca, **despublicar** aditivo e
distrato. `/dev` continua existindo só fora da básica.

### 3.14 E-mails

Quatro e-mails só: convite para assinar, código, lembrete, "assinado" com
o PDF. Remetente `contrato@bullacheck.com.br`, responder-para o e-mail do
Davi. Sem aviso de vencimento, sem reajuste.

## 4. O que fica escondido (lista fechada)

| Função | Onde estava | Como some | Volta quando |
|---|---|---|---|
| "O que diz a lei" | assinatura, prévias | `edicao.lei=false` | advogado revisar (#11) |
| Validade jurídica, "vale em juízo" | site | seção removida | idem |
| Demonstração por e-mail e interessados | site, `/api/demo/*` | 404 | houver tráfego sem o Davi |
| Modelos (página da org), PDF de amostra | menu | rota some | revisão (#11) |
| Aditivo, distrato | biblioteca, detalhe | despublicados | alguém pedir |
| Agenda, vigência, reajuste, "próximos 30 dias" | menu, visão geral, detalhe | rota some | alguém pedir |
| Chaves de API, webhooks | menu admin | rota some | integração pedida |
| ICP-Brasil | novo contrato, assinatura | método fixo e-mail | clínica exigir |
| Carimbo do tempo, pacote .zip, .tsr | detalhe | botões somem | advogado pedir |
| Exportar tudo | empresa | só CLI | alguém pedir |
| WhatsApp | notificações | desligado | v0.4 |
| Seções Recursos, modelo é lógica, para quem (4 cartões), o que não faz | site | removidas | site v2 |
| `/dev` | público | só fora da básica | nunca na básica |

## 5. Lançamentos, nova ordem

| Versão | Semana | O que prova | Validação (passa se) | Davi | Dev |
|---|---|---|---|---|---|
| **v0.1** | 27/out a 2/nov | Um link sai da máquina e é assinado longe | 3 amigos assinam pelo celular sem ajuda; dossiê no Supabase | domínio, Resend, DNS, EasyPanel, developer, enviar | interruptor `EDICAO=basica`, site reduzido, menu, esconder lei e ICP, planilhas de exemplo, `/seguranca` reescrita, acompanhar a subida |
| **v0.2** | 3 a 9/nov | O RH da IMAGO envia o termo de sigilo para a casa inteira pela planilha | 50+ assinaturas em uma semana; o RH chega ao fim com o Davi do lado, sem o dev | sentar com o RH, subir a planilha, anotar o que trava | ajustes do que travar, nada novo |
| **v0.3** | 10 a 16/nov | O contrato PJ médico cobre o que a IMAGO faz hoje | a IMAGO compara com o contrato atual e lista o que falta; 5 médicos assinam | levar o modelo ao administrador e a um médico | variáveis de saúde no modelo de serviços (CRM, especialidade, modalidade, escala como estimativa) |
| **v0.4** | a partir de 17/nov (Davi integral) | O que a IMAGO pediu nas três semanas | lista real de pedidos, em ordem de quem pediu mais | reunião de balanço com dono/admin/RH | construir só o que está na lista |
| **v0.5** | dez | Modelos revisados por advogado | advogado aprova e publica pelo painel; "o que diz a lei" volta | cobrar a data do advogado | diff de versão para o advogado aprovar olhando a mudança |
| **v1.0** | jan | Segunda clínica | uma clínica que não conhece o Davi assina 10 contratos | caso da IMAGO em uma frase; primeiro anúncio | preço, cobrança manual (Pix), termo de uso (#12) |

Pergunta por cláusula (prova de compreensão, não de ciência) entra como
**experimento em v0.2 ou v0.3**, numa fração das pessoas, medindo recusa
e tempo. Se não atrapalhar, vira padrão.

## 6. O que a básica mede

1. **Tempo do envio à assinatura** (mediana, por modelo).
2. **Funil**: enviado, abriu, identificou, leu até o fim, assinou.
3. **Onde param**: cláusula onde a leitura trava, dúvidas por cláusula,
   recusas e motivos.
4. **Pedidos de suporte**: o que o RH perguntou ao Davi, anotado à mão,
   com data. É a lista da v0.4.

## 7. Tarefas do Davi esta semana (nenhuma depende de código)

- [ ] **Qui 23/out, IMAGO.** Roteiro de cinco perguntas (abaixo). Sair de lá
      com: como o PJ é contratado hoje, quantos por ano, de onde vem o
      modelo, quem mandaria o link, quem aprova. Se der, uma cópia
      anonimizada do contrato atual e do termo atual.
- [ ] **Advogado.** Descobrir a especialidade. Marcar data (não "quando
      der") para meia hora com o link de assinatura aberto: (1) isso serve
      de prova em alguma situação real, e em qual não serve; (2) o que não
      posso prometer no site; (3) revisar os dois modelos, com prazo.
- [ ] **Domínio** `bullacheck.com.br` no registro.br.
- [ ] **Resend**: conta, chave, domínio e DNS (SPF, DKIM).
- [ ] **EasyPanel** na Hostinger: app pelo Dockerfile do repo, variáveis do
      `.env.example` mais `EDICAO=basica`, volume em `/app/dados`, domínio
      com HTTPS, health check em `/saude`.
- [ ] **Supabase**: `delete from public.registros;` e esvaziar o bucket
      `arquivos` (registros de teste).
- [ ] **Primeiro developer** no servidor: `node src/cli.js developer <e-mail> "<nome>"`.

### Roteiro na IMAGO (RH ou administrador, uma hora)

1. Como é hoje contratar um médico PJ, do "sim" até o contrato assinado?
   Me conta o último.
2. Quantos contratos de PJ nos últimos 12 meses? Quantas pessoas da casa
   assinaram termo de sigilo?
3. De onde vem o modelo de contrato? Quem mexe nele?
4. Quando alguém demora para assinar, o que acontece? Já deu problema?
5. Se amanhã fosse por link no celular, quem mandaria? Quem aprova isso?

## 8. O que eu faço depois do "ok" (e nada antes)

> **Feito em 23/out/2026**, com três desvios do plano, registrados aqui:
> (a) aditivo e distrato **não** foram despublicados na semente: já não
> aparecem na lista de modelos e as rotas respondem 404 na básica, e mexer
> na semente afetaria a edição completa; (b) o modelo de serviços foi para
> a versão 2 e a cláusula das partes ganhou a versão 2 (estado civil e
> profissão opcionais, com a frase "O CONTRATADO declara…" só quando vêm),
> o que exige **re-semear** a biblioteca onde ela já existia: no Supabase,
> o `delete from public.registros;` da tarefa do Davi resolve; (c) o
> interruptor também desliga `/v1`, a agenda em segundo plano, os webhooks
> e o contrato de exemplo por e-mail no servidor, não só no menu.
> Variáveis novas: `EDICAO` e `CONTATO_WHATSAPP` (`.env.example`).

1. `EDICAO=basica` no servidor, objeto `edicao` em `/eu` e no site.
2. Menu e rotas do painel lendo `edicao`.
3. Site reduzido (seção 3.1), rodapé com a frase da revisão, `/seguranca`
   reescrita.
4. Esconder "o que diz a lei", ICP, pacote .zip, carimbo, aditivo, distrato,
   agenda, exportação, medidor de plano, "próximos 30 dias", índice de
   reajuste no formulário.
5. Despublicar aditivo e distrato na semente; planilhas de exemplo por modelo.
6. Tornar nacionalidade, estado civil e profissão opcionais no modelo de
   serviços (linter confere que o texto continua certo sem elas).
7. Testes: os 140 continuam; mais um `edicao.test.js` que sobe com
   `EDICAO=basica` e confere que cada rota escondida responde 404 e que o
   menu não as lista.
8. Portão técnico do ROTEIRO (build, lint, legislação, screenshots 390 e
   1440), CHANGELOG v0.1, STATUS.
