# Status do projeto

> Atualizado em 20/out/2026. Este arquivo é o ponto de retomada:
> o que está pronto, o que foi decidido e o que vem a seguir.

## Onde estamos

As seis fases do plano (motor, assinatura, lote, plataforma, contrato vivo,
plugáveis) estão prontas desde 16/out de manhã. À tarde começou a **refação
página por página**, com foco em funcionalidade e design, nesta ordem:

| # | Tela | Estado | Commit |
|---|---|---|---|
| 1 | Site de apresentação (`/`) | ✅ pronto | `725fb80`, `bb713b7` |
| 2 | Entrar, redefinir senha e visão geral do painel | ✅ pronto | `a8cd58c` |
| 3 | Lista de contratos e novo contrato | ✅ pronto | `245b1e5` |
| 4 | Detalhe do contrato | ✅ pronto | `cabd125` |
| 5 | Tela pública de assinatura (`assinar.html`) | ✅ pronto | `ec2041b` |
| 6 | Selo de verificação (`verificar.html`) | ✅ pronto | `385b536` |
| 7 | Lotes, lote e assinatura em lote | ✅ pronto | `a1cf1fb` |
| 8 | Agenda | ✅ pronto | `62f2835` |
| 9 | Empresa, usuários, chaves e webhooks | ✅ pronto | `51ed8ee` |
| 10 | Plataforma: organizações, saúde, auditoria | ✅ pronto | `68a4ca5` |
| 11 | Plataforma: biblioteca (modelos e cláusulas no banco) | ✅ pronto | `735ed7c` |
| 12 | `/dev` | ⏭ depois (issue #10) | |

140 testes passando (`npm test`).

### Leitura de prontidão (17/out, fim do dia)

**Protótipo funcional completo, pré-piloto.** Tudo que o produto promete
funciona de ponta a ponta na máquina local; ninguém de fora consegue usar
ainda. Dá para levar à IMAGO **como demonstração no notebook** agora mesmo
(e colher as respostas da issue #1). **Não** dá para assinar contrato de
verdade lá ainda.

| Item | Hoje | Bloqueia o piloto? |
|---|---|---|
| E-mail para o signatário | só caixa interna (`/dev`) | Sim (#5) |
| Hospedagem e domínio | localhost | Sim (#6) |
| Modo produção testado fora da máquina | não | Sim (#6) |
| Modelo médico PJ | só o genérico | Sim (#2, depende de #1) |
| Revisão por advogado | nenhuma | Sim (#11) |
| Termo de uso e privacidade | não existe | Sim (#12) |
| Carimbo do tempo e raízes ICP | configuráveis, desligados | Não |
| Cobrança e planos | não existe | Não (piloto gratuito) |

Trabalho técnico para fechar os "sim": uma a duas semanas. O jurídico depende
de achar o advogado responsável. O que pode andar sem o Davi: transporte
Resend (#5) e modo produção (#6), deixando tudo pronto para ligar as chaves.

Validade: a assinatura é eletrônica avançada (Lei 14.063/2020 e MP 2.200-2),
válida para contrato privado entre as partes. Para o contrato PJ da clínica
basta; não precisa de certificado ICP-Brasil do médico.

## Decisões de design (16/out/2026)

- **Fundo branco predominante em tudo**, site e painel, sempre em tema claro
  mesmo com o sistema em modo escuro. Separação por contornos finos, não por
  cor de fundo. Azul-céu é a única cor de ação. Detalhes em
  [IDENTIDADE.md](IDENTIDADE.md).
- **Site**: página de produto, não documento. Títulos em Lexend sem
  caixa-alta; a bula (caixa-alta condensada + marca-texto amarelo) aparece só
  dentro da demonstração, que é o componente real da tela de assinatura, e no
  logotipo.
- **Painel**: mesmo visual limpo. Formulários numa grade de 12 colunas com
  largura por tipo de campo, rótulos curtos (o grupo diz de quem é o campo),
  inicial maiúscula em rótulos de opção e de situação.
- **Telas públicas (assinatura e selo)**: a bula fica no conteúdo (títulos de
  cláusula em caixa-alta condensada, marca-texto amarelo no resumo); a casca
  em volta é branca, com contornos finos e título em Lexend. O `app.css` não
  tem mais modo escuro: sempre claro.

## O que foi acrescentado de funcionalidade nesta rodada

- **"Tenho uma dúvida" na cláusula (20/out):** na tela de assinatura, toda
  cláusula tem "Tenho uma dúvida sobre esta cláusula"; a pergunta vai para a
  trilha (`clausula.duvida`), quem enviou recebe e-mail e vê o cartão
  "Dúvidas do signatário" no detalhe do contrato, responde ali, e a resposta
  volta por e-mail e na tela da pessoa (que confere sozinha a cada 30 s).
  Perguntar não trava a assinatura. Pergunta e resposta entram no dossiê
  (seção própria no PDF) e no webhook `signatario.duvida`. É a versão mais
  honesta da assinatura consciente: a pessoa não assina sem entender, e a
  empresa prova que explicou (duvidas.test.js).
- **Demonstração real pelo site (20/out):** o visitante deixa nome e e-mail
  (clínica e WhatsApp opcionais) em `/#experimentar` e recebe um contrato de
  exemplo de verdade, da organização "Clínica Exemplo" (criada sozinha no
  primeiro pedido), com o nome dele e o resto fictício; assina com a bula e vê
  o selo. Vira **interessado**: e-mail ao developer e lista em Plataforma →
  Interessados, com até onde a pessoa foi (abriu, confirmou, leu, assinou).
  Um pedido por e-mail por dia, cinco por IP por hora, campo-armadilha para
  robô, link de 2 dias (`src/plataforma/demonstracao.js`,
  demonstracao.test.js). Fora de produção o link vem na resposta, para a demo
  no notebook. O site não manda mais ninguém para o login.
- **Bloco técnico (20/out):** fontes servidas pelo próprio sistema
  (`public/estatico/fontes/`, CSP sem Google: nada de terceiro na tela de
  quem assina); `link.aberto` registrado no máximo uma vez por hora por
  signatário (scanner de e-mail não enche a trilha); diário em disco das
  escritas pendentes do Supabase (`DADOS_DIR/fila-supabase.json`), refeitas
  na subida seguinte se o processo cair; CI no GitHub Actions
  (`.github/workflows/testes.yml`); backup e restauração do Supabase
  (`ferramentas/backup.mjs`); pacote de prova em .zip com LEIA-ME de
  conferência (`GET /v1/contratos/:id/pacote.zip`, botão no detalhe);
  ferramentas de screenshot e semeadura dentro do repo (`ferramentas/`);
  runbook em [OPERACAO.md](OPERACAO.md).
- **Marca da organização (20/out):** em Dados da empresa, o administrador
  define nome de exibição ("IMAGO" em vez da razão social), cor de destaque e
  logotipo. A tela de assinatura e a do lote mostram o logotipo acima de
  "Enviado por" e usam a cor no lugar do azul de ação; o e-mail do link e do
  lembrete saem em nome da marca. A casca continua branca. A cor precisa de
  contraste 4,5 com branco; o logotipo é reconhecido pelo conteúdo (PNG, JPG,
  WebP, SVG sem script), vai para o mesmo armazenamento dos PDFs e sai por
  `/marca/<arquivo>` (`src/plataforma/marca.js`, marca.test.js).
- **Diretório de pessoas e "novo a partir deste" (20/out):** cada contrato
  gerado cadastra (ou atualiza) a parte no diretório da organização
  (`src/partes.js`, coleção `partes`, chave = CNPJ, CPF ou e-mail). A tela
  Pessoas lista e busca; "Novo contrato" de lá já chega preenchido
  (`/contratos/novo?parte=`). No formulário, o grupo da parte tem uma busca no
  diretório que preenche tudo. No detalhe do contrato e na agenda, "Novo a
  partir deste" / "Renovar" abrem o formulário com os mesmos dados e a data
  de início em branco (`?de=`). partes.test.js.
- **Avisos e lembretes (20/out):** a organização recebe e-mail quando alguém
  assina (com quem falta), quando todos assinam, quando alguém recusa (com o
  motivo), um dia antes de o prazo vencer e quando vence
  (`src/plataforma/avisos.js`, pelo mesmo gancho dos webhooks; vai a quem
  enviou e aos administradores). A agenda lembra o signatário 3 e 1 dia antes
  de o link expirar, com link novo, e expira os vencidos sem depender de
  alguém abrir o contrato (avisos.test.js). Veio do estudo de onde melhorar:
  [ESTUDO-2026-10-20.md](ESTUDO-2026-10-20.md), que é a fila de trabalho.

- **Biblioteca viva (17/out):** cláusulas e modelos moram no armazenamento
  (coleções `clausulas` e `modelos`), semeados dos arquivos de `biblioteca/` na
  primeira subida. O developer administra em Plataforma → Biblioteca: editor de
  modelo (variáveis, cláusulas com condição, signatários, vida, lote, modo JSON,
  prévia com dados de exemplo) e editor de cláusula (parágrafos com condição,
  bula, destaque, prévia ao vivo). Cláusula editada = versão nova; modelos só
  mudam quando o developer aplica. Modelo salvo = rascunho; publicar exige
  linter ok e sobe a versão. Organização só vê e gera com modelo publicado;
  contratos existentes guardam o snapshot. Decisão do Davi: "o dev refina e
  libera, o usuário só consome", como no ExameQR (biblioteca.test.js).

- `GET /api/demo/contrato?exemplo=…`: monta os exemplos do repositório para o
  site mostrar o motor ao vivo (site.test.js).
- Senha esquecida: `POST /painel/api/senha/esquecida`, `GET|POST
  /painel/api/redefinir/:token` (painel.test.js). Ver [PLATAFORMA.md](PLATAFORMA.md).
- Prévia do contrato antes de gerar: `POST /org/modelos/:chave/previa`
  (painel.test.js).
- Detalhe do contrato devolve eventos com autor, IP e dados resumidos, mais o
  índice de cláusulas (painel.test.js).
- Visão geral lê agenda e lotes; lista de contratos tem chips com contagem e
  nota de prazo.

## Pendências e decisões em aberto

> As pendências viraram **issues no GitHub** em 17/out (ver `gh issue list`):
> #1 averiguação na IMAGO (ponto de partida), #2-#4 kit saúde v1, #5 e-mail
> Resend, #6 hospedagem/domínio/produção, #7 piloto, #8 nome, #9 consentimento
> (segunda onda), #10 página /dev, #11 papéis revisor/aprovador com OAB no
> dossiê, #12 termo de uso e privacidade. O que está abaixo é o contexto.
> A equipe (quem faz o quê, por fase) está em [ATUACAO.md](ATUACAO.md), seção 9.

- **Nome do produto.** "Contratos" é provisório. Sugestões levantadas: Ciente
  (recomendada), Bulla, Clausa, Nítido. Davi pediu para pensar depois. Onde
  trocar está em [IDENTIDADE.md](IDENTIDADE.md).
- **Supabase: ligado.** Projeto "contratos" (ref `gjpfplwirjterbkrybds`), tabela
  `registros` com RLS e bucket privado `arquivos`, criados pelo conector em
  17/out (`supabase/migrations/`). O servidor usa a **service_role** via
  `SUPABASE_URL` e `SUPABASE_KEY` (a chave fica só com o Davi e no ambiente do
  servidor; não está no repo nem em nota). Testado de ponta a ponta: registros
  e PDFs chegam, o servidor reinicia e recarrega tudo, a chave anon não lê
  nada. Vale para uma instância; com mais de uma, converter os serviços para
  ler do Postgres a cada pedido. Os arquivos de teste do bucket foram apagados
  em 17/out; os ~100 registros de teste da tabela ficaram (o conector não pôde
  apagar em massa): limpar com `delete from public.registros;` no SQL Editor
  antes de usar de verdade.
- E-mail real ainda não existe (tudo cai na caixa do `/dev`).
- Biblioteca de cláusulas sem revisão de advogado; raízes ICP-Brasil com
  impressões digitais a conferir antes de produção; ZapSign adiado.
- Teste de ICP-Brasil (`plugaveis.test.js`) falhou uma vez de forma
  intermitente em 16/out e passou em seguida. Ficar de olho.

## Como retomar

```bash
npm install && npm run build
PORT=3100 npm start          # a porta 3000 costuma estar ocupada na máquina do Davi
npm test
```

Logins de teste (senha `senha-de-teste-local`): `admin@clinica-exemplo.com.br`
(empresa) e `dev@contratos.local` (plataforma). Os contratos de exemplo do
servidor local são criados por um roteiro de semeadura (um assinado, dois
aguardando, um recusado, um só gerado) que vive fora do repo; ver a nota no
fim.

### Ferramentas de trabalho (`ferramentas/`)

- `shot.mjs <url> <nome> [--widths=390,1440] [--login=email:senha] [--el=seletor] [--type=sel=texto]`:
  screenshot com o Chrome local (`puppeteer-core`, devDependency), acusando
  vazamento horizontal, erros de console e requisições falhas. Sai em
  `ferramentas/shots/` (ignorado pelo git).
- `fluxo-assinar.mjs <link> <prefixo> [--assinar]`: percorre a tela de
  assinatura e fotografa cada etapa.
- `semear.mjs [url]`: cria no servidor local um contrato assinado, dois
  aguardando, um recusado e um só gerado.
- `backup.mjs`: backup e restauração do Supabase (ver OPERACAO.md).
