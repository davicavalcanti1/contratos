# Assinatura própria (Fase 2)

> Estado em 16/out/2026: fluxo completo funcionando **sem banco** (coleções JSON
> em `dados/`) e **sem e-mail de verdade** (as mensagens vão para a caixa de
> saída do `/dev`). Base legal em [VALIDADE-JURIDICA.md](VALIDADE-JURIDICA.md).

## Como testar

```bash
npm install
npm start                   # http://localhost:3000/dev
```

No `/dev`: escolha um exemplo, confira quem assina, **Gerar e enviar**. A caixa
de saída mostra o e-mail com o link e, depois, o código. Abra o link numa aba
anônima ou no celular (mesma rede: `BASE_URL=http://<ip-do-pc>:3000 npm start`).

## O fluxo do signatário

```
link  →  código no e-mail  →  lê com a bula  →  "li e entendi" em cada destaque
      →  rola até o fim  →  digita o nome + "concordo"  →  assinado
                                       └── quando o último assina: SELO
```

O servidor recusa a assinatura sem **todos** estes pontos, e não só a tela:

| Exigência | Por quê |
|---|---|
| Código de 6 dígitos válido (10 min, 5 tentativas, 60 s entre envios) | autoria: só quem tem o e-mail assina |
| Ciência em **cada** cláusula crítica | CDC arts. 46 e 54 §4º: conhecimento prévio e destaque |
| Leitura até o fim | afasta o "assinei sem ler" |
| Nome digitado = nome cadastrado (sem acento e sem caixa) | intenção expressa, registrada literalmente |
| "Li e concordo" marcado | manifestação de vontade |

O conteúdo do contrato **só aparece depois do código**: ele tem CPF, endereço e
valores, e o link pode ter sido encaminhado.

## Lembretes e avisos (20/out/2026)

A agenda (`src/vida/agenda.js`), que roda de hora em hora, cuida do que
acontece quando ninguém faz nada:

- **Lembrete ao signatário** 3 dias e 1 dia antes de o link expirar, com um
  link novo (o anterior deixa de valer). Contrato recém-enviado (menos de 24 h)
  não recebe; quem confirmou o código nas últimas 2 h também não, porque o
  link novo derrubaria a leitura em andamento; na ordem sequencial, só quem
  está na vez; o representante do lote fica de fora (o lembrete dele é o
  "Lembrar" da tela do lote). Cada lembrete entra na trilha como
  `lembrete.enviado`.
- **Expiração sem acesso**: a checagem de prazo era preguiçosa (só quando
  alguém abria o contrato); agora a agenda expira os vencidos e avisa.

E a organização fica sabendo por e-mail (`src/plataforma/avisos.js`), pelo
mesmo gancho dos webhooks: **assinou** (dizendo quem ainda falta),
**assinado por todos** (código e selo), **recusou** (com o motivo), **expira
amanhã** (junto do último lembrete) e **expirou** (quem não assinou). Recebe
quem enviou pelo painel (`enviado_por` no contrato) mais os administradores
ativos; enviado pela API, os emissores também. Leitor e usuário inativo nunca
recebem. Testes em `test/avisos.test.js`.

## O selo

Quando o último signatário assina, o sistema gera o **PDF final**: o mesmo
texto (o hash do conteúdo é idêntico ao do original), mais o QR e o código de
verificação em cada página e a página de assinaturas com as evidências.

`/v/<código>` é público. Mostra a situação, quem assinou (**nome e CPF
mascarados**: `João S. E.`, `***.982.247-**`), a integridade da trilha e
permite **conferir um PDF**. O hash é calculado no navegador e só ele é enviado,
nunca o arquivo. Valor e texto do contrato não aparecem.

## Evidências guardadas (o dossiê)

`GET /v1/contratos/:id/dossie` em JSON, ou `?formato=pdf` para juntar num processo:

- hash do conteúdo, do PDF original e do PDF final;
- signatários com horário da identificação, de cada ciência, da leitura e da
  assinatura; IP; user-agent; nome digitado; localização (se a pessoa permitiu);
- **trilha encadeada**: cada evento carrega o hash do anterior, e alterar,
  remover ou reordenar um evento quebra a corrente (`verificarTrilha`);
- o tempo de leitura por cláusula, **informado pelo navegador**. É evidência
  auxiliar e está rotulado assim no dossiê, porque o cliente pode forjá-lo.

## API

| Rota | Quem | O quê |
|---|---|---|
| `GET /v1/modelos` | organização | modelos e variáveis que o cliente preenche |
| `POST /v1/contratos` | organização | `{ modelo, dados }` → gera; **422** com `faltando`/`invalidos` se houver lacuna |
| `POST /v1/contratos/:id/enviar` | organização | `{ signatarios: [{nome, email, cpf?, papel}], ordem: paralela\|sequencial, prazo_dias? }` |
| `POST /v1/contratos/:id/signatarios/:sid/reenviar` | organização | novo link; **o anterior para de funcionar** |
| `POST /v1/contratos/:id/cancelar` | organização | antes de assinado |
| `GET /v1/contratos/:id` | organização | situação, signatários, dados preenchidos, eventos (com autor, IP e o essencial de cada um) e índice de cláusulas |
| `GET /v1/contratos/:id/arquivo?qual=original\|final` | organização | PDF |
| `GET /v1/contratos/:id/dossie[?formato=pdf]` | organização | evidências |
| `/api/assinar/:token/*` | signatário | `codigo`, `codigo/validar`, `conteudo`, `ciencia`, `leitura`, `assinar`, `recusar`, `arquivo` (exige `X-Sessao` depois do código) |
| `GET /api/verificar/:codigo`, `POST …/conferir` | público | selo e conferência por hash |

A organização se autentica por `Authorization: Bearer <chave>`. Na Fase 2 as
organizações vêm de um arquivo (`ORGANIZACOES_ARQUIVO`); o cadastro de verdade é
a Fase 4.

## Segurança

- Token do link, código e sessão são guardados **só como hash**.
- `Referrer-Policy: no-referrer` e `<meta name="referrer">`: o token está na
  URL e não pode vazar para fontes ou recursos externos. CSP restrita, sem
  inline, sem iframe e **sem terceiro**: as fontes vêm do próprio sistema
  (`public/estatico/fontes/`), então nem o IP de quem assina sai daqui.
- `link.aberto` entra na trilha no máximo uma vez por hora por signatário:
  scanner de e-mail e recarregar a página não viram dezenas de "abriu".
- O log mascara `/assinar/<token>` (o stdout vai para o EasyPanel, lição do ExameQR).
- `trust proxy` ligado: o IP registrado é o do signatário, não o do proxy.
- Limite de 20 pedidos/validações de código por IP a cada 10 min.
- E-mail sintético (`@exameqr.app`, `example.com`) é recusado no envio.
- `eventos` é append-only **no armazenamento**, e os PDFs não se sobrescrevem.

## O que ainda não é de verdade

| Falta | Onde entra |
|---|---|
| Envio real de e-mail/WhatsApp (hoje, caixa de saída) | transporte novo em `src/notificacoes.js`, como o Resend do ExameQR |
| Banco (hoje, JSON em disco) | mesma interface de `src/armazenamento/repo.js`, com Postgres; append-only vira trigger |
| Carimbo do tempo ACT ICP-Brasil sobre o hash final | Fase 6. Sem ele, os horários são do nosso servidor |
| Cadastro de organizações, usuários e chaves | Fase 4 |
| Aviso à organização quando alguém assina, recusa ou o prazo vence | **feito em 20/out**: e-mail a quem enviou e aos administradores (`src/plataforma/avisos.js`) |
| Limitador de tentativas em memória (zera ao reiniciar) | vai para o banco junto com o resto |
