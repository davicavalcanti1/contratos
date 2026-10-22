# Operação: como rodar, o que vigiar, o que fazer quando quebra

> 20/out/2026. Uma página para quem está de plantão. O resto está em
> [STATUS.md](STATUS.md) (estado), [PLATAFORMA.md](PLATAFORMA.md) (painel e
> API) e [PLUGAVEIS.md](PLUGAVEIS.md) (carimbo e ICP-Brasil).

## Subir

```bash
npm ci && npm run build
NODE_ENV=production BASE_URL=https://<dominio> SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<service_role> npm start
```

| Variável | O quê |
|---|---|
| `PORT` | porta (padrão 3000) |
| `BASE_URL` | URL pública: vai nos links, no QR impresso no PDF e nos e-mails. **Não trocar depois que houver PDF assinado**: o QR impresso aponta para ela |
| `SUPABASE_URL`, `SUPABASE_KEY` | banco e arquivos. A chave é a **service_role**: só no ambiente do servidor, nunca em arquivo versionado nem no front |
| `DADOS_DIR` | sem Supabase: onde ficam os JSON e os PDFs. Com Supabase: onde fica o **diário** de escritas pendentes (`fila-supabase.json` e `pendentes/`). Padrão `./dados`; precisa ser disco persistente |
| `EDICAO` | `basica` liga só o que a edição básica usa (docs/BASICA.md): some "o que diz a lei", ICP-Brasil, carimbo, pacote .zip, aditivo/distrato, agenda, reajuste, chaves de API, webhooks, `/v1`, página de modelos, demonstração do site, exportação, plano e `/dev`. O painel lê `edicao` em `/eu`. Sem a variável, tudo ligado |
| `CONTATO_WHATSAPP` | número com DDI e DDD, só dígitos, do botão "Falar com a gente" do site na edição básica; sem ele, o botão vira `mailto:` de `EMAIL_RESPONDER_PARA` |
| `NODE_ENV=production` | desliga `/dev`, exige https nos webhooks, não cria contas de teste, e **derruba na subida** se faltar BASE_URL (https), SUPABASE_URL, SUPABASE_KEY ou o e-mail |
| `RESEND_API_KEY`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA` | e-mail real pelo Resend. O remetente é `Nome <email@dominio-verificado>`; sem domínio verificado, `onboarding@resend.dev` só entrega para o e-mail da conta. Cada envio (ou erro) fica na coleção `caixa`. `EMAIL_TRANSPORTE=caixa` sobe sem e-mail, de propósito |
| `CARIMBO_URL`, `CARIMBO_NOME`, `CARIMBO_ICP_BRASIL`, `CARIMBO_USUARIO`, `CARIMBO_SENHA` | carimbo do tempo (ver PLUGAVEIS.md). Vazio = desligado em produção |

Primeiro developer: `node src/cli.js developer <email> "<nome>"` imprime o link do convite.

**Com Docker** (Railway, Render, EasyPanel, VPS): o `Dockerfile` compila o painel e
sobe `node src/servidor/index.js` na porta 3000, com health check em `/saude`.
Montar um volume em `/app/dados` e colar as variáveis do `.env.example`. Passo a
passo da primeira subida em [LANCAMENTO-v0.1.md](LANCAMENTO-v0.1.md).

## O que vigiar

- **Painel → Plataforma → Saúde**: contratos parados há mais de 7 dias,
  webhooks falhando, tamanho da caixa de saída.
- **Log do processo** (stdout): linhas `[supabase] … falhou` (rede ou chave),
  `[carimbo]` (ACT fora do ar: o contrato fica com carimbo pendente e o
  sistema tenta a cada 10 min), `[avisos]`, `[agenda]`.
- **Diário do Supabase**: `DADOS_DIR/fila-supabase.json` deve estar `[]` na
  maior parte do tempo. Cheio por muito tempo = o Supabase não está aceitando
  escrita (chave revogada, projeto pausado, rede).
- Um verificador externo de disponibilidade (UptimeRobot ou similar) em
  `GET /verificar`, a cada 5 min.

## Backup (todo dia)

```bash
SUPABASE_URL=… SUPABASE_KEY=… node ferramentas/backup.mjs /caminho/do/backup
```

Gera `registros-<data-hora>.json` (a tabela inteira) e espelha o bucket em
`arquivos/` (só baixa o que ainda não está lá; os arquivos nunca mudam de
conteúdo). Copie a pasta para **outro lugar** (outro disco, R2, B2): o
Supabase no plano gratuito não tem recuperação pontual, e os PDFs são a prova
que o produto vende. Agende no Agendador de Tarefas do Windows ou no cron.

Restaurar num projeto novo (depois de aplicar `supabase/migrations/`):

```bash
SUPABASE_URL=… SUPABASE_KEY=… node ferramentas/backup.mjs --restaurar backup/registros-2026-10-20-03-00.json backup/arquivos
```

## Legislação (de vez em quando)

```bash
node ferramentas/legislacao.mjs atualizar
```

Rebaixa de github.com/ctresb/leis as normas de `legislacao/normas.json` e
avisa se algum artigo citado numa cláusula mudou de texto: aí alguém relê a
cláusula. Commitar os `.md` e o `fontes.json` (a data da coleta vai na bula).
Ver [LEGISLACAO.md](LEGISLACAO.md).

## Quando quebra

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Ninguém recebe link nem código | e-mail ainda é a caixa interna (`/dev`), ou o transporte real caiu | ver a caixa em `/dev` fora de produção; em produção, o log do transporte |
| `[supabase] … 401` no log | chave trocada ou revogada | gerar nova service_role no painel do Supabase e reiniciar com ela; o diário refaz o que ficou pendente |
| `[supabase] … 5xx` seguidos | Supabase fora do ar ou projeto pausado | o servidor segue servindo da memória; nada se perde enquanto o processo viver e o diário estiver em disco persistente. Reativar o projeto; a fila entrega sozinha |
| Processo caiu com escrita pendente | queda, deploy no meio | ao subir, `[supabase] refazendo N escrita(s) que ficaram no diário`. Conferir que o número cai a zero |
| Contrato com "carimbo pendente" por horas | ACT fora do ar ou credencial errada | `CARIMBO_URL`/usuário/senha; o sistema tenta a cada 10 min; o contrato está assinado e válido, só sem o horário de terceiro |
| Webhook "falhou" no painel do cliente | URL do cliente fora do ar | o cliente clica em "tentar de novo" na tela de Webhooks |
| Link de assinatura "substituído por um mais novo" | reenvio ou lembrete automático gerou link novo | a pessoa usa o último e-mail recebido |
| Painel em branco ou 503 "Painel não compilado" | build não rodou no deploy | `npm run build` antes de `npm start` |

## Encerrar uma conta

Antes de suspender ou apagar uma organização, ela (ou você, como suporte)
baixa a exportação completa em Dados da empresa → Exportar tudo. A prova de
cada contrato vai com ela; o que fica aqui só se apaga depois do prazo de
guarda combinado no termo de uso (#12).

## O que nunca fazer

- Trocar `BASE_URL` com contratos assinados: o QR impresso quebra.
- Apagar linhas de `eventos` ou arquivos do bucket: a trilha e os hashes são a prova.
- Rodar duas instâncias do servidor com o mesmo Supabase: a memória de cada
  uma diverge (ver `src/armazenamento/supabase.js`).
