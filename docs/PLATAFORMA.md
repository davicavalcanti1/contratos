# Plataforma: painel, organizações, API e webhooks (Fase 4)

> Estado em 16/out/2026: funcionando **sem banco**, por decisão (JSON em
> `dados/`, atrás de `src/armazenamento/repo.js`), e **sem e-mail real**
> (convites, links e códigos vão para a caixa de saída do `/dev`).

## Como testar

```bash
npm install
npm run build        # compila o painel (React) para public/painel
npm start            # http://localhost:3000/painel
```

Fora de produção, o servidor cria duas contas (senha `senha-de-teste-local`):

| Login | Papel | O que dá para fazer |
|---|---|---|
| `dev@contratos.local` | developer | organizações, planos, suspensão, saúde, auditoria, suporte só leitura |
| `admin@clinica-exemplo.com.br` | administrador da empresa de exemplo | contratos, lotes, dados da empresa, usuários, chaves, webhooks |

E-mails "enviados" (convites, links de assinatura, códigos) aparecem em `/dev`.
Para mexer no painel com recarga automática: `npm start` num terminal e
`npm run dev:painel` em outro (http://localhost:5173/painel).

## Papéis

| Papel | Escopo | Pode |
|---|---|---|
| `developer` | a plataforma | criar organizações e convidar o primeiro admin; plano e limite; suspender; ver saúde e auditoria; **abrir uma organização só para leitura** (suporte), registrado na auditoria |
| `org_admin` | 1 organização | tudo do emissor, mais dados da empresa, usuários, chaves de API e webhooks |
| `emissor` | 1 organização | gerar e enviar contratos e lotes, reenviar e cancelar |
| `leitor` | 1 organização | consultar e baixar |

A organização nunca fica sem administrador ativo, e ninguém muda o próprio
papel. O papel `redator` da arquitetura entra quando existir o editor de
modelos (hoje os modelos são da biblioteca da plataforma).

## Contas e sessão

- **Convite, não cadastro aberto.** Quem entra recebe um link (vale 7 dias) e
  cria a própria senha. O primeiro developer de produção nasce pela CLI:
  `node src/cli.js developer <email> "<nome>"`, que imprime o link do convite.
- Senha com **scrypt** e sal. Mínimo de 10 caracteres.
- **5 erros de senha bloqueiam o e-mail por 15 min.** A resposta e o tempo são
  os mesmos para e-mail existente e inexistente.
- Sessão em cookie **HttpOnly, SameSite=Strict**, Secure atrás de https, 12 h.
  Trocar a senha encerra as outras sessões; desativar o usuário também.
- **Senha esquecida** (`POST /painel/api/senha/esquecida`): a resposta é a mesma
  exista ou não a conta. Se existir, vai um link por e-mail que vale 1 hora e uma
  vez só (`/painel/redefinir/:token`); redefinir derruba as outras sessões e já
  entra. O link mora na coleção de convites com `tipo: redefinicao` e não serve
  como convite.
- **CSRF**: além do SameSite, o painel recusa escrita com os tipos de conteúdo
  que um formulário de outro site consegue mandar.
- O token do convite também é mascarado no log, como o dos links de assinatura.

## Organizações e planos

| Plano | Contratos/mês |
|---|---|
| Teste | 20 |
| Essencial | 200 |
| Profissional | 2.000 |
| Ilimitado | sem limite |

O developer também pode dar um limite próprio a uma organização. Passar do
limite devolve **402** com o consumo. O mês é o de Brasília, então um contrato
das 22h do dia 31 conta no mês dele. No lote, o limite é conferido contra o
número de linhas prontas **antes** de gerar qualquer contrato.

**Suspensa**: a organização consulta, mas não gera, não envia e não altera
nada. Quem já recebeu um link continua conseguindo assinar, porque o
signatário não tem culpa da conta da empresa.

**Cadastro da empresa** (razão social, CNPJ, endereço, representante, cargo,
e-mail do encarregado de dados) aparece como incompleto em toda tela até ser
preenchido. Sem ele, os modelos não geram.

## API

`/v1/*` com `Authorization: Bearer <chave>`. As chaves são criadas no painel
(Chaves de API), mostradas **uma vez** e guardadas só como hash. Escopo
**gera e consulta** ou **só consulta**. Revogar corta na hora.

As **mesmas rotas** servem ao painel em `/painel/api/org/*`, com a sessão no
lugar da chave. O que a API faz, o painel faz, e vice-versa. Novidades desta fase:

| Rota | O quê |
|---|---|
| `GET /v1/conta` | organização, plano e consumo do mês |
| `GET /v1/contratos?status=&referencia=&busca=&lote_id=&pagina=&limite=` | lista paginada |
| `POST /v1/contratos` | aceita `referencia`: o id do contrato no **seu** sistema; volta em toda consulta e webhook |
| `POST /v1/modelos/:chave/conferir` | `{ dados }` → campos que este contrato precisa, o que falta, o que está inválido, quem assina |
| `GET /plataforma/biblioteca`, `GET/PUT /plataforma/biblioteca/modelos/:chave`, `POST …/publicar`, `…/despublicar`, `…/lint`, `…/previa`, `POST /plataforma/biblioteca/modelos` (novo ou `copiar_de`), `GET /plataforma/biblioteca/clausulas/:chave`, `POST /plataforma/biblioteca/clausulas` (versão nova), `POST …/clausulas/:chave/aplicar` | developer | biblioteca: editar, publicar, versionar |
| `POST /v1/modelos/:chave/previa` | `{ dados }` → o contrato montado com o que já há, lacunas como `{{variável}}`, mais `rotulos`; só leitura, não conta no plano |

O `conferir` é o que deixa o formulário de novo contrato **dinâmico**: escolher
PJ faz aparecer CNPJ e representante e sumir o CPF. Ele respeita o
curto-circuito das regras, então com prazo indeterminado a duração não é
pedida, mesmo aparecendo na regra do reajuste.

## Webhooks

Configurados no painel (Webhooks). Eventos:

| Evento | Quando |
|---|---|
| `contrato.assinado` | todos assinaram; o contrato foi selado |
| `signatario.assinou` | uma pessoa assinou (inclusive a empresa, pelo lote) |
| `contrato.recusado` | alguém recusou, com o motivo |
| `contrato.expirando` | falta 1 dia para o prazo vencer e ainda faltam assinaturas |
| `contrato.expirado` | o prazo venceu |
| `contrato.cancelado` | a organização cancelou |

```
POST <sua url>
X-Contratos-Evento:     contrato.assinado
X-Contratos-Entrega:    <id>   ← igual em todas as tentativas: use para não processar duas vezes
X-Contratos-Assinatura: t=<unix>,v1=<HMAC-SHA256(segredo, "<t>.<corpo cru>")>

{ "id": "evt_…", "tipo": "contrato.assinado", "criado_em": "…",
  "dados": { "contrato": { "id", "status", "referencia", "codigo_verificacao", "pdf_final_sha256", … },
             "verificacao_url": "https://…/v/XXXX-XXXX-XXXX", "signatarios": [ … ] } }
```

- 2xx em até 10 s = entregue. Senão, **nova tentativa** em 1 min, 5 min, 30 min,
  2 h e 6 h; depois, "falhou", com botão de tentar de novo no painel.
- O histórico de respostas de cada entrega fica no painel (código e começo do corpo).
- **SSRF**: em produção só https, nada de localhost ou rede interna, e o DNS é
  resolvido **na hora da entrega** (um domínio pode passar a apontar para
  dentro depois do cadastro). Redirecionamento não é seguido.
- Falha de webhook nunca derruba a assinatura: o aviso é feito depois, por fila.

## Painel

React + Vite em `painel/`, compilado para `public/painel` e servido pelo
próprio Express em `/painel`. Mesma identidade da tela de assinatura (papel,
tinta, marinho e marca-texto), largura total no desktop e menu recolhível no
celular. A tela de assinatura **continua em HTML puro**, para abrir rápido no
celular de quem assina.

## Ainda não é de verdade

| Falta | Onde entra |
|---|---|
| Banco | interface de `src/armazenamento/repo.js`; Postgres numa fase própria |
| E-mail real (convite, link, código) | transporte em `src/notificacoes.js` (Resend) |
| Redefinir senha esquecida sozinho | hoje o admin (ou o developer) convida de novo |
| Cobrança do plano | o plano limita, mas ninguém paga ainda |
| Editor de modelos e papel `redator` | biblioteca por organização |
| White-label (marca da organização na tela de assinatura) | depois |
| Bloqueio de login e limite por IP em memória | zeram ao reiniciar; vão para o banco |
