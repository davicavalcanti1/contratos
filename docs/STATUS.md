# Status do projeto

> Atualizado em 16/out/2026, fim do dia. Este arquivo é o ponto de retomada:
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
| 4 | Detalhe do contrato | ✅ pronto | este commit |
| 5 | Tela pública de assinatura (`assinar.html`) | ⏭ próxima | |
| 6 | Selo de verificação (`verificar.html`) | | |
| 7 | Lotes, lote e assinatura em lote | | |
| 8 | Agenda | | |
| 9 | Empresa, usuários, chaves e webhooks | | |
| 10 | Plataforma: organizações, saúde, auditoria | | |
| 11 | `/dev` | | |

116 testes passando (`npm test`).

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
- **Telas públicas (assinatura e selo)** ainda têm a identidade "bula +
  linguagem simples" original. Ao refazê-las, manter a bula no conteúdo e
  aplicar o branco e os contornos finos em volta.

## O que foi acrescentado de funcionalidade nesta rodada

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

- **Nome do produto.** "Contratos" é provisório. Sugestões levantadas: Ciente
  (recomendada), Bulla, Clausa, Nítido. Davi pediu para pensar depois. Onde
  trocar está em [IDENTIDADE.md](IDENTIDADE.md).
- **Supabase.** Davi vai criar um projeto free. Plano: manter
  `src/armazenamento/repo.js` síncrono, com os Maps em memória como fonte em
  tempo de execução, carregando do Supabase ao subir e gravando a cada escrita
  (write-through); PDFs e `.tsr` no Storage. Falta a **service_role key**; URL e
  chave pública vêm pelo conector. Converter tudo para async fica para quando
  houver mais de uma instância.
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

### Ferramentas de trabalho (fora do repo)

Durante a refação usamos um checador de layout com `puppeteer-core` e o
Chrome local: tira screenshot em 390 e 1440 px, com ou sem preferência
escura, faz login, preenche e clica, e acusa vazamento horizontal, erros de
console e requisições falhas. Ele e o roteiro de semeadura ficaram no
scratchpad da sessão do Claude Code (`ferramentas/shot.mjs`, `semear.mjs`).
Se forem úteis de novo, vale trazê-los para `ferramentas/` no repo, com
`puppeteer-core` como devDependency.
