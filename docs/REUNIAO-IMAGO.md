# Reunião na IMAGO (23/out/2026): o que levar, o que dizer, o que pedir

> Contexto que muda tudo: o Davi **trabalha na IMAGO**. A clínica não é
> cliente; é o lugar onde ele vai testar um projeto pessoal, de graça, e
> o dono é também o chefe dele. Isso pede mais clareza, não menos.

## 1. O que falta, em ordem de importância

| # | O que | Por quê | Quem |
|---|---|---|---|
| 1 | **Um link que sai da máquina** | Demonstrar no notebook é "veja o que eu fiz". Receber o link no próprio celular do dono é "veja o que a sua equipe vai viver". É a diferença entre curiosidade e piloto | Davi, hoje (seção 3) |
| 2 | **O que dizer e em que ordem** | A reunião tem 20 minutos de atenção. Perguntas primeiro, demonstração depois, pedido no fim | roteiro na seção 2 |
| 3 | **Uma página escrita do acordo** | Projeto pessoal usando dados de funcionários do empregador precisa estar combinado por escrito, mesmo de graça. Não é contrato; é um e-mail depois da reunião | rascunho na seção 4 |

O que **não** falta: mais telas, mais modelos, mais recursos. O que existe
basta para o termo de sigilo e para um contrato PJ genérico.

## 2. Roteiro da reunião (20 minutos)

**Abertura (2 min).** Dizer, nesta ordem, sem enfeitar:
1. "É um projeto meu, feito fora do horário, com o meu dinheiro."
2. "Quero testar aqui, de graça, porque a dor que vocês têm eu já ouvi:
   esperar o funcionário assinar demora."
3. "Não estou vendendo nada hoje. Quero entender como vocês fazem e,
   se fizer sentido, rodar um teste com o RH em novembro."

**Perguntas (8 min).** As cinco do BASICA.md, seção 7. Anotar as respostas
na hora, em palavras deles. Não corrigir, não explicar o produto no meio.
1. Como é hoje contratar um médico PJ, do "sim" até o contrato assinado? O último.
2. Quantos PJ nos últimos 12 meses? Quantas pessoas da casa assinaram termo de sigilo?
3. De onde vem o modelo? Quem mexe nele?
4. Quando alguém demora para assinar, o que acontece? Já deu problema?
5. Se fosse por link no celular, quem mandaria? Quem aprova?

**Demonstração (5 min).** Só o termo de sigilo, que é o que a casa inteira
assina. No painel, enviar o termo para o próprio celular do Davi (ou do
dono, se ele topar na hora). Mostrar no celular: o link, o código, a
leitura com o resumo em palavras simples, o "li e entendi" na cláusula de
sigilo, a assinatura, o PDF com o selo. No painel: o status mudando e o
dossiê. Não mostrar lote, leitura, modelos, nada mais. Se perguntarem
"e o contrato do médico?", responder: "mesmo caminho; me dá o modelo de
vocês que eu coloco no sistema".

**O pedido (3 min).** Um só: *"Posso rodar o termo de sigilo com toda a
equipe em novembro, sentado com o RH, sem custo? Em troca, eu quero saber
o que travou e uma frase de vocês no fim."* E um pedido menor: *"Me passa
o contrato PJ e o termo que vocês usam hoje."*

**Fechamento (2 min).** "Vou te mandar um e-mail com o que combinamos,
onde os dados ficam e que vocês podem parar quando quiserem."

## 3. O link que sai da máquina, hoje

A EasyPanel da Hostinger já existe. Sem domínio ainda, o próprio EasyPanel
dá um endereço `https://…easypanel.host`, e isso basta para amanhã.

1. **Push do repositório** (o commit `d48c797` está só na máquina).
2. **Resend**: criar a conta **com o e-mail que você vai abrir no celular**
   amanhã. Copiar a chave da API. Sem domínio verificado, o remetente
   `onboarding@resend.dev` entrega só para esse e-mail, e é o suficiente.
3. **EasyPanel**: app a partir do GitHub, build pelo `Dockerfile`, porta
   3000, volume em `/app/dados`, domínio gerado com HTTPS. Variáveis:
   ```
   NODE_ENV=production
   EDICAO=basica
   BASE_URL=https://<o endereço que o EasyPanel deu>
   SUPABASE_URL=https://gjpfplwirjterbkrybds.supabase.co
   SUPABASE_KEY=<service_role>
   DADOS_DIR=/app/dados
   RESEND_API_KEY=<chave>
   EMAIL_REMETENTE=BullaCheck <onboarding@resend.dev>
   EMAIL_RESPONDER_PARA=<seu e-mail>
   CONTATO_WHATSAPP=<seu número, só dígitos, com 55 e DDD>
   ```
4. **Supabase**, antes da primeira subida: `delete from public.registros;`
   no SQL Editor e esvaziar o bucket `arquivos`. A biblioteca é semeada de
   novo na subida, já com a cláusula das partes versão 2.
5. No console do EasyPanel: `node src/cli.js developer <seu e-mail> "<seu nome>"`.
   Aceitar o convite pelo e-mail. Criar a organização IMAGO pelo painel da
   plataforma, convidar você mesmo como administrador dela, preencher os
   dados da empresa (razão social, CNPJ, endereço, representante).
6. **Ensaiar** o fluxo inteiro à noite: enviar o termo para o seu e-mail,
   abrir no celular, assinar, baixar o PDF. Se qualquer passo falhar, me
   chama com o log do EasyPanel.

Se o BASE_URL com `https` e o Supabase não estiverem certos, o servidor
**não sobe de propósito** e diz o que falta no log.

**Plano B**, se a subida não der certo até a noite: demonstrar no notebook
com `PORT=3100 npm start` sem `EDICAO` (a edição completa mostra a caixa
de saída em `/dev`, de onde se copia o link para abrir no celular na mesma
rede Wi-Fi, com `BASE_URL=http://<ip do notebook>:3100`). É pior: mostra
telas que a básica esconde. Só se não houver outro jeito.

## 4. O e-mail depois da reunião (rascunho, ajustar com o que foi dito)

> Assunto: BullaCheck na IMAGO: o que combinamos
>
> Oi, [nome]. Como falei hoje, o BullaCheck é um projeto pessoal meu,
> feito fora do horário e sem relação com o meu trabalho na clínica.
> Combinamos de testar o termo de sigilo com a equipe em novembro, de
> graça, comigo sentado com o RH. O que vale para o teste:
>
> - A IMAGO não paga nada e pode parar quando quiser; os PDFs assinados
>   e o registro de cada assinatura ficam disponíveis para baixar.
> - Os dados (nome, CPF, e-mail, cargo de quem assina) ficam em banco na
>   nuvem (Supabase), só o sistema acessa, e a IMAGO continua responsável
>   por eles perante a LGPD; eu trato como operador, só para gerar, colher
>   a assinatura e guardar a prova.
> - Os modelos ainda não passaram por advogado. Se a IMAGO quiser usar o
>   próprio texto, eu coloco o texto de vocês no sistema.
> - Não prometo validade em juízo nem proteção trabalhista. O que o
>   sistema registra é quem leu o quê, quando, e assinou.
>
> Em troca, peço o retorno de vocês sobre o que travou e, se der certo,
> uma frase para eu usar. Obrigado pela confiança.

Isso não é parecer jurídico nem substitui o termo de uso (#12). É só o
combinado escrito, para ninguém se surpreender depois.

## 5. O que não dizer amanhã

- "Vale em juízo", "você consegue provar", "protege contra pejotização".
  Nenhum advogado validou. Dizer: "registra quem leu o quê e quando".
- "Tem API, lote, agenda, reajuste." Ninguém pediu. Se perguntarem, "dá
  para fazer; hoje não está ligado".
- "Vou cobrar X." Preço não existe. Se perguntarem: "para a IMAGO é de
  graça; preço eu decido depois de ver funcionando".
- Nome de outra clínica. Não há outra.

## 6. O que trazer de volta

As respostas às cinco perguntas, o contrato PJ e o termo atuais (mesmo em
foto), quem seria a pessoa do RH para sentar junto, e a data. Isso decide
a v0.2 e a v0.3 (BASICA.md, seção 5).
