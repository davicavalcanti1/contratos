# Arquitetura

> v0.1 — 16/out/2026. Sem banco ainda: as tabelas aparecem aqui como **entidades**
> (ver [DOMINIO.md](DOMINIO.md)), e a escolha do armazenamento fica para a fase de
> implementação. Itens com ❓ são decisões pendentes.

## 1. Hierarquia (multi-tenant), análoga ao ExameQR

```
Developer (dono da plataforma, superadmin global)
   └── cadastra Organizações, define plano, liga integrações, publica a
       biblioteca oficial de modelos e cláusulas
Organização  (= TENANT isolado: empresa, escritório, imobiliária, cartório)
   ├── Áreas (opcional): RH, Jurídico, Comercial, Filial X
   ├── Usuários internos, com papéis (abaixo)
   ├── Biblioteca própria (modelos e cláusulas), herdando ou não a oficial
   ├── Fontes de dados (base de funcionários, clientes, imóveis…)
   └── Contratos
          └── Signatários: pessoas EXTERNAS, sem conta, entram por link
```

| ExameQR | Aqui |
|---|---|
| Dono (`owner`) | **Developer** |
| Empresa principal | **Organização** |
| Parceiro | **Parte** (de um diretório ou de uma fonte de dados) |
| Coordenador que assina | **Signatário** (sem login; identidade por OTP e evidências) |
| `contrato_padrao` da plataforma | **Biblioteca oficial**, versionada |
| `contrato_modelos.usa_padrao` | Modelo da organização que **herda** um oficial |

**Isolamento:** toda entidade carrega `organizacao_id`, e nenhuma consulta cruza
organizações. O Developer é o único com visão global.

**Organização-revendedora ❓** — um escritório que atende 30 clientes quer
gerenciar os contratos de cada um separadamente. Duas saídas: (a) o escritório é
a organização e os clientes são **Áreas**; (b) organizações **filhas**. A (a) é
mais simples e cobre o MVP. A (b) só se aparecer demanda.

## 2. Papéis

| Papel | Escopo | Faz |
|---|---|---|
| `developer` | global | cria organizações e planos, configura integrações, publica a biblioteca oficial, vê uso e auditoria |
| `org_admin` | 1 organização | usuários, papéis, marca, fontes de dados, integrações, faturamento |
| `redator` | organização/área | cria e edita modelos e cláusulas; **publica** versão (passa pelo linter) |
| `emissor` | organização/área | gera contratos (avulso ou em lote) a partir de modelos publicados e envia para assinatura |
| `aprovador` (opcional) | organização/área | libera contrato acima de um limite (valor, tipo) antes do envio |
| `leitor` | organização/área | consulta contratos e baixa evidências (auditoria, contador) |
| **signatário** | 1 contrato | lê, dá ciência às cláusulas críticas, assina ou recusa. **Sem conta** |
| **verificador** | público | escaneia o QR, vê o selo e confere o hash. Sem login |

Separar `redator` de `emissor` é o que deixa o RH gerar 40 contratos sem poder
mexer numa vírgula do texto aprovado pelo jurídico.

## 3. Serviços internos (módulos do microsserviço)

Um único serviço implantável, organizado em módulos com fronteiras claras. Se
algum precisar escalar sozinho (ex.: geração de PDF em lote), ele sai sem
reescrever os outros.

```
            ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
  Painel ──▶│  Identidade │   │  Biblioteca  │   │    Fontes    │
  (web)     │  & Tenancy  │   │ modelos +    │   │  de dados    │
            └─────────────┘   │ cláusulas +  │   │ CSV/API/DB   │
  API   ──▶                   │ linter       │   └──────┬───────┘
  pública                     └──────┬───────┘          │
                                     ▼                  ▼
                              ┌──────────────────────────────┐
                              │  Geração                     │
                              │  resolve regras + variáveis, │
                              │  snapshot imutável, PDF      │
                              └──────────────┬───────────────┘
                                             ▼
         ┌──────────────┐     ┌──────────────────────────────┐
         │ Notificações │◀───▶│  Assinatura                  │
         │ e-mail, Whats│     │  provedor próprio | ZapSign  │
         │ SMS          │     │  | ICP-Brasil (plugáveis)    │
         └──────────────┘     └──────────────┬───────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │  Evidências & Selo           │
                              │  trilha, hash, carimbo de    │
                              │  tempo, dossiê, verificação  │
                              └──────────────┬───────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │  Ciclo de vida               │
                              │  vencimento, reajuste,       │
                              │  aditivo, distrato           │
                              └──────────────────────────────┘
```

| Módulo | Responsabilidade | Herdado do ExameQR |
|---|---|---|
| **Identidade & Tenancy** | login de usuários internos, papéis, isolamento | hierarquia owner→empresa, convite sem signup público |
| **Biblioteca** | modelos, cláusulas, variáveis, regras, versões, linter | `contrato_padrao` versionado, `resolverModelo`, `conferirTexto` |
| **Fontes de dados** | conectar e mapear bases externas para variáveis | — (novo) |
| **Geração** | modelo + dados → contrato (snapshot) + PDF; bloqueia lacuna | `montarConteudo` → `faltando`, `gerar-contrato-pdf` |
| **Assinatura** | sessão do signatário, OTP, ciência por cláusula, aceite | provedor plugável, `provedor = interno \| zapsign` |
| **Evidências & Selo** | trilha de eventos, hash, carimbo, dossiê, página pública | `hash_sha256`, bucket privado com URL assinada de 5 min |
| **Ciclo de vida** | prazos, alertas, aditivo/distrato ligados ao original | — (novo) |
| **Notificações** | envio e reenvio do link, lembretes | WhatsApp/e-mail do ExameQR, rejeição de e-mail sintético (`emailReal`) |
| **Faturamento** | plano, consumo (contratos/mês, signatários) | — |

## 4. Fontes de dados: "vincular ao banco de funcionários"

O sistema **não copia a base inteira** da empresa. Ele lê o que precisa no
momento de gerar, e o snapshot fica no contrato.

| Conector | Para quem | Como |
|---|---|---|
| **Planilha / CSV** | todo mundo (MVP) | upload, mapeamento coluna → variável, validação (CPF, datas) antes de gerar |
| **API REST do cliente** | quem tem sistema próprio | URL + token; o sistema chama `GET /pessoas/:id` com um contrato de resposta definido |
| **Banco externo em leitura** ❓ | empresa com folha própria | conexão read-only a uma view que a empresa expõe. Exige cuidado de segurança; avaliar depois |
| **Diretório interno** | quem não tem nada | cadastro de partes dentro do próprio sistema |
| **Integrações prontas** ❓ | depois | sistemas de folha, CRMs, o próprio ExameQR |

**Mapeamento** é o passo crucial: a organização diz uma vez "a coluna
`NOME_COMPLETO` é `parte.nome`, `SALARIO_BASE` é `contrato.remuneracao`", e todo
lote seguinte reutiliza isso. O LGPD vale aqui: só os campos mapeados são lidos,
e o log registra o que foi lido e para qual contrato.

## 5. API (o produto também é infraestrutura)

O ExameQR (e qualquer outro SaaS) passa a ser **cliente** deste serviço, em vez
de manter o próprio módulo.

```
POST   /v1/contratos                 gera a partir de modelo + dados (ou fonte)
POST   /v1/contratos/lote            gera N a partir de uma fonte/planilha
POST   /v1/contratos/:id/enviar      abre a assinatura e notifica signatários
GET    /v1/contratos/:id             status, signatários, eventos
GET    /v1/contratos/:id/arquivo     PDF assinado (URL de curta duração)
GET    /v1/contratos/:id/dossie      dossiê de evidências (PDF + JSON)
POST   /v1/contratos/:id/aditivos    aditivo ligado ao original
GET    /v1/modelos                   modelos publicados e suas variáveis
POST   /v1/webhooks                  assinar eventos: contrato.assinado, .recusado, .expirado…
GET    /verificar/:codigo            PÚBLICO — selo de autenticidade
```

- Autenticação por **chave de API da organização**, com escopo (só gerar, só ler).
- **Idempotência** por `Idempotency-Key`: reenviar não cria um segundo contrato
  (lição do ExameQR: dois links válidos circulando).
- **Webhooks de saída assinados** (HMAC). Os de entrada (ZapSign) são
  autenticados pelo segredo da organização, nunca por um segredo global.

## 6. Painel do Developer

O que o Developer faz, como o dono faz no ExameQR:

- **Organizações**: criar, suspender, plano, limites, marca (white-label ❓).
- **Biblioteca oficial**: publicar modelos e cláusulas versionados, com o linter
  e o painel de conformidade. As organizações que herdam recebem a versão nova no
  próximo contrato gerado, nunca nos já assinados.
- **Integrações globais**: provedor de e-mail/WhatsApp, ACT de carimbo do tempo,
  ICP-Brasil, credenciais de provedores.
- **Auditoria e saúde**: volume por organização, falhas de envio, webhooks com
  erro, contratos travados.
- **Entrar como organização** (suporte), registrado na trilha.

## 7. Stack sugerida (a confirmar na implementação)

Mantém o que o Davi já opera, para não inventar ops novo:

- **Backend**: Node + Express (como o ExameQR), em módulos por domínio.
- **Frontend**: React + Vite + Tailwind. **Painel** (org/developer) e **app de
  assinatura** separados: o app de assinatura é leve, mobile-first e sem login.
- **Banco** ❓: Postgres. Fica para depois, como combinado. O desenho já assume
  isolamento por `organizacao_id` e imutabilidade garantida no banco (trigger),
  não só na aplicação.
- **PDF**: geração no servidor (pdfkit, como o `gerar-contrato-pdf`, ou
  HTML→PDF via Chromium se o layout exigir).
- **Arquivos**: storage privado, acesso só por URL assinada de curta duração.
- **Deploy**: EasyPanel, serviço próprio, **sem nada da Imago**.

## 8. Fases

| Fase | Entrega | Prova que funciona |
|---|---|---|
| **0 — Estrutura** (agora) | estes documentos, decisões fechadas | Davi aprova visão, diferenciais e domínio |
| **1 — Motor** | biblioteca, variáveis tipadas, regras PF/PJ, linter, geração de PDF; sem assinatura | o modelo único "Prestação de Serviços" gera certo para PF, PJ e MEI |
| **2 — Assinatura própria** | link, OTP, ciência por cláusula (bula), trilha, hash, selo/QR, dossiê | contrato assinado no celular com o dossiê completo, e o QR verifica |
| **3 — Lote + fontes** | CSV com mapeamento, geração em lote, painel de progresso | 40 contratos de RH a partir de uma planilha |
| **4 — Developer + multi-tenant + API** | painel do developer, chaves de API, webhooks | o ExameQR gerando contrato por API |
| **5 — Contrato vivo** | vencimentos, reajuste, aditivo, distrato | alerta 30 dias antes e aditivo ligado ao selo |
| **6 — Plugáveis** | ICP-Brasil, carimbo ACT, ZapSign | o mesmo contrato assinado com certificado A1/A3 |

A fila de execução vai para o `imago-platform/board.md` quando a Fase 0 fechar.
