# Changelog

Uma seção por versão: data, hipótese, o que entrou, validação e post.
As etapas E1 a E9 são retroativas (ver `docs/ROTEIRO.md`, seção 2): código
pronto, validação pendente, tags `etapa-N`. Versões `vX.Y` são lançamentos
públicos, e cada uma só fecha com validação registrada.

## v0.1 — em andamento (27/out a 2/nov/2026)

- **Hipótese:** um link enviado pelo sistema chega a alguém longe da máquina e é assinado pelo celular.
- **Entra:** nome **BullaCheck** (decidido em 21/out), símbolo e wordmark
  (`marca/`), nome trocado no site e no painel, Instagram build in public
  (`docs/MARCA.md`), posts 1 e 2 prontos, roteiro de etapas
  (`docs/ROTEIRO.md`), playbook do Instagram (`docs/INSTAGRAM.md`: perfil,
  destaques, um post por avanço, métricas), capas de destaques, o post de
  apresentação em 2x, e este changelog.
- **Também entra (22/out):** e-mail real pelo Resend com cópia na caixa
  (`src/notificacoes.js`), checagens de produção na subida, `Dockerfile`,
  `.env.example`, `/saude` para o host, plano da semana em
  `docs/LANCAMENTO-v0.1.md`.
- **Validação:** três pessoas de fora assinam pelo celular sem instrução por
  telefone; o post do avanço sai com a tela de verdade.
- **Post:** —

## E9 — Legislação (21/out/2026) · commits `87e495f`, `7e32cd8`

- Texto compilado de dez normas federais em `legislacao/`; "O que diz a
  lei" embaixo de cada cláusula na assinatura e no painel; editor de
  cláusula mostra o artigo ao digitar; linter reprova artigo inexistente.
- Validação pendente: medir, no teste de compreensão (v0.12), quantos abrem
  o bloco e se ajudou.

## E8 — Operação e onda 1/2 (17 e 20/out/2026) · `0e7729f`…`85da35f`

- Supabase como armazenamento; CI; backup; e-mails à organização e
  lembretes; diretório de pessoas e "novo a partir deste"; marca da
  organização na tela de assinar; demonstração real pelo site; "tenho uma
  dúvida" na cláusula; painel de leitura e recusas; exportação da
  organização; página de modelos; página de segurança e privacidade.
- Validação pendente: uma semana no ar com domínio real (depende de #5/#6).

## E7 — Identidade e refação página por página (16 e 17/out/2026) · `d26d0fe`…`68a4ca5`

- Bula nas telas públicas, fé pública no PDF, site como vitrine de produto,
  painel limpo; todas as telas refeitas uma a uma com fundo branco.
- Validação pendente: teste de 5 segundos no site com 10 pessoas.

## E6 — Plugáveis (16/out/2026) · `71e476a`

- Carimbo do tempo RFC 3161 e verificação de PDF assinado com ICP-Brasil.
- Validação pendente: advogado e 2 clínicas dizem se exigem para o piloto.

## E5 — Contrato vivo (16/out/2026) · `d13e3da`

- Vigência, agenda, reajuste por índice do Banco Central, aditivo, distrato.
- Validação pendente: admin e contador olham agenda e reajuste.

## E4 — Plataforma (16/out/2026) · `d87d911`

- Organizações, usuários, papéis, chaves de API, webhooks, painel.
- Validação pendente: admin de clínica faz o fluxo inteiro em < 10 min.

## E3 — Lote (16/out/2026) · `6d8807d`

- Planilha do RH → mapeamento → prévia → envio; assinatura em lote.
- Validação pendente: um RH sobe a planilha real.

## E2 — Assinatura com bula (16/out/2026) · `6db5907`

- Link, código, leitura com bula, ciência por cláusula, selo verificável com
  QR, dossiê com trilha encadeada por hash.
- Validação pendente: 10 leitores, 5 perguntas de compreensão.

## E1 — Motor (16/out/2026) · `899c14b`

- Modelos como lógica (cláusulas com regras e variáveis tipadas), linter que
  confere todas as combinações, PDF.
- Validação pendente: um revisor cria um modelo sem ajuda em 2 h.
