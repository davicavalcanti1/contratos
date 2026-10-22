# v0.1: o primeiro lançamento público (semana de 27/out a 2/nov/2026)

> Escrito em 22/out. v0.1 é a primeira versão que alguém de fora usa: um
> contrato enviado pelo BullaCheck chega por e-mail a uma pessoa longe da
> máquina do Davi, ela lê com a bula no celular e assina. Tudo que já existe
> (etapas E1 a E9, ver ROTEIRO.md) entra, mas o que v0.1 **prova** é só isso.

## Pronto quando

- [ ] `https://bullacheck.com.br` responde com o site, o painel e `/saude`.
- [ ] Um contrato enviado do painel chega por e-mail de `@bullacheck.com.br`
      (não cai no spam do Gmail nem do Outlook).
- [ ] **Três pessoas de fora** assinam pelo celular sem instrução por
      telefone, e o dossiê de cada uma fica no Supabase.
- [ ] O post "O primeiro contrato enviado para alguém de fora" sai no
      Instagram com a tela de verdade.

## Quem faz o quê, dia a dia

| Dia | Davi | Dev |
|---|---|---|
| **Qui 23/out** | Registrar `bullacheck.com.br` (registro.br) e, se quiser, `bullacheck.com`. Criar conta no [Resend](https://resend.com) e copiar a chave da API | Transporte Resend, checagens de produção, Dockerfile, `/saude` (feito em 22/out) |
| **Sex 24/out** | Escolher o host: recomendação abaixo. Criar o projeto e colar as variáveis do `.env.example` | Acompanhar o primeiro deploy; corrigir o que quebrar fora da máquina |
| **Sáb 25/out** | No Resend: adicionar o domínio e criar os registros DNS (SPF, DKIM, MX de retorno) no painel do registro.br ou da Hostinger. Esperar verificar | Teste de entrega: enviar para um Gmail e um Outlook e conferir pasta e cabeçalhos |
| **Dom 26/out** | `delete from public.registros;` no SQL Editor do Supabase (registros de teste). Rodar `node src/cli.js developer <seu e-mail> "<nome>"` no servidor e aceitar o convite | Semeadura de produção: criar a organização do Davi pelo painel, publicar os modelos |
| **Seg 27/out** | Enviar o primeiro contrato de verdade (modelo genérico) para **três amigos** pelo painel | Observar os logs e a caixa; corrigir na hora |
| **Ter a Qui** | Os três assinam. Anotar o que travou, em que tela, e o que perguntaram | Ajustes pequenos; prints para o post |
| **Sex 31/out** | Publicar o post 2 (Avanço) | Gerar o post, atualizar CHANGELOG, tag `v0.1` |

Se o DNS do Resend demorar (pode levar até 48 h), o plano B é subir com
`EMAIL_REMETENTE=onboarding@resend.dev`, que só entrega para o e-mail da
conta Resend: dá para testar o fluxo inteiro consigo mesmo e trocar o
remetente quando o domínio verificar, sem redeploy.

## Hospedagem: recomendação

O código já espera um proxy na frente (`trust proxy`), Node 22, um disco
persistente em `DADOS_DIR` e as variáveis do `.env.example`. Qualquer um
destes serve; a ordem é de menor atrito:

1. **Railway** (railway.app): conecta no GitHub, detecta o Dockerfile,
   cria o volume para `/app/dados` em dois cliques, domínio próprio com
   HTTPS automático. Cerca de US$ 5/mês neste tamanho.
2. **Render**: igual, com disco persistente no plano pago (US$ 7/mês).
3. **EasyPanel numa VPS** (Hostinger, Contabo): mais barato por mês, mais
   coisa para cuidar. Vale quando houver mais de um serviço.

Em qualquer um: build pelo `Dockerfile`, porta 3000, health check em
`/saude`, variáveis do `.env.example`, volume em `/app/dados`.

## O que fica de fora de v0.1, de propósito

- Kit saúde, revisão do advogado e termo de uso (#2–#4, #11, #12): o
  contrato enviado em v0.1 é o modelo genérico, entre amigos, sem valor
  comercial. O site diz que os modelos não passaram por advogado.
- Carimbo do tempo e ICP-Brasil: desligados (sem `CARIMBO_URL`).
- Lote, reajuste, WhatsApp: existem, não entram no post.

## Depois de v0.1

v0.2 é o teste de compreensão da bula com dez pessoas (ROTEIRO.md). Os
três amigos de v0.1 são os três primeiros.
