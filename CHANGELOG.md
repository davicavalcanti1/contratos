# Changelog

Uma seção por versão: data, hipótese, o que entrou, validação e post.
Versões v0.1 a v0.9 são retroativas (ver `docs/ROTEIRO.md`, seção 2):
código pronto, validação pendente. A partir de v0.10, cada versão só fecha
com validação registrada.

## v0.10 — em andamento (semana de 27/out/2026)

- **Hipótese:** o nome comunica "contrato que a pessoa entende".
- **Entra:** nome, logomarca, identidade da marca, Instagram build in
  public, post 1, roteiro de etapas (`docs/ROTEIRO.md`) e este changelog.
- **Validação:** 10 pessoas ouvem o nome e dizem o que acham que é; post 1
  com ao menos 3 comentários de desconhecidos.
- **Post:** —

## v0.9 — Legislação (21/out/2026) · commits `87e495f`, `7e32cd8`

- Texto compilado de dez normas federais em `legislacao/`; "O que diz a
  lei" embaixo de cada cláusula na assinatura e no painel; editor de
  cláusula mostra o artigo ao digitar; linter reprova artigo inexistente.
- Validação pendente: medir, no teste de compreensão (v0.12), quantos abrem
  o bloco e se ajudou.

## v0.8 — Operação e onda 1/2 (17 e 20/out/2026) · `0e7729f`…`85da35f`

- Supabase como armazenamento; CI; backup; e-mails à organização e
  lembretes; diretório de pessoas e "novo a partir deste"; marca da
  organização na tela de assinar; demonstração real pelo site; "tenho uma
  dúvida" na cláusula; painel de leitura e recusas; exportação da
  organização; página de modelos; página de segurança e privacidade.
- Validação pendente: uma semana no ar com domínio real (depende de #5/#6).

## v0.7 — Identidade e refação página por página (16 e 17/out/2026) · `d26d0fe`…`68a4ca5`

- Bula nas telas públicas, fé pública no PDF, site como vitrine de produto,
  painel limpo; todas as telas refeitas uma a uma com fundo branco.
- Validação pendente: teste de 5 segundos no site com 10 pessoas.

## v0.6 — Plugáveis (16/out/2026) · `71e476a`

- Carimbo do tempo RFC 3161 e verificação de PDF assinado com ICP-Brasil.
- Validação pendente: advogado e 2 clínicas dizem se exigem para o piloto.

## v0.5 — Contrato vivo (16/out/2026) · `d13e3da`

- Vigência, agenda, reajuste por índice do Banco Central, aditivo, distrato.
- Validação pendente: admin e contador olham agenda e reajuste.

## v0.4 — Plataforma (16/out/2026) · `d87d911`

- Organizações, usuários, papéis, chaves de API, webhooks, painel.
- Validação pendente: admin de clínica faz o fluxo inteiro em < 10 min.

## v0.3 — Lote (16/out/2026) · `6d8807d`

- Planilha do RH → mapeamento → prévia → envio; assinatura em lote.
- Validação pendente: um RH sobe a planilha real.

## v0.2 — Assinatura com bula (16/out/2026) · `6db5907`

- Link, código, leitura com bula, ciência por cláusula, selo verificável com
  QR, dossiê com trilha encadeada por hash.
- Validação pendente: 10 leitores, 5 perguntas de compreensão.

## v0.1 — Motor (16/out/2026) · `899c14b`

- Modelos como lógica (cláusulas com regras e variáveis tipadas), linter que
  confere todas as combinações, PDF.
- Validação pendente: um revisor cria um modelo sem ajuda em 2 h.
