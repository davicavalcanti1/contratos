# Diferenciais — para decidir juntos

Gerar PDF a partir de modelo e colher assinatura por link é o básico de qualquer
concorrente (DocuSign, Clicksign, ZapSign, D4Sign). Se o produto for só isso, ele
compete em preço. Abaixo estão as teses que tiram ele do clichê. Cada uma diz
**por que importa juridicamente**, não só como funcionalidade.

---

## Tese 1 — "Contrato com bula" ⭐ recomendada como identidade

Cada cláusula do modelo tem, além do texto jurídico, um **resumo em linguagem
simples** de 1 ou 2 linhas. Na tela de assinatura, o signatário vê os dois lado a
lado. As cláusulas marcadas como **críticas** (multa, renúncia, fidelidade, foro,
limitação de responsabilidade) exigem uma **ciência individual**, um toque de
"li e entendi" em cada uma, e cada toque é registrado na trilha com horário.

**Por que importa:**
- **CDC art. 46**: o contrato não obriga o consumidor se ele não teve a
  oportunidade de conhecer o conteúdo antes.
- **CDC art. 54 §4º**: cláusula que limita direito do consumidor deve ser
  redigida **com destaque**, para ser identificada imediata e facilmente.
- Na Justiça do Trabalho e no consumidor, a defesa padrão é "assinei sem ler".
  A ciência por cláusula, com horário e tempo de leitura, é a resposta a ela.

Ninguém no mercado brasileiro faz isso como identidade do produto. Sai
"assinatura eletrônica" e entra **"assinatura consciente"**.

O resumo é escrito pelo autor do modelo, e a IA pode sugerir um rascunho. Mas o
resumo **não é o contrato**: o rodapé da tela diz que prevalece o texto
integral. Esse ponto precisa de revisão de advogado.

## Tese 2 — Selo verificável (QR em cada página) ⭐ recomendada

Todo contrato assinado recebe um **código de verificação** e um **QR em cada
página**. Quem escaneia, mesmo de uma cópia impressa, cai numa página pública
que mostra: autenticidade, data, partes (mascaradas: `***.456.789-**`), hash
SHA-256 e status (vigente, distratado, aditado). Também dá para **arrastar um
PDF** na página para conferir se ele é idêntico ao original, comparando o hash
no navegador sem enviar o arquivo.

**Por que importa:** a integridade "conferida por provedor de assinatura" é
exatamente o que o **CPC art. 784 §4º** exige para dispensar as testemunhas no
título executivo. O selo torna essa conferência pública e instantânea, e é o
que um cartório ou escritório quer ao receber um contrato de terceiro.

Também é a herança natural do Exame**QR**, do mesmo DNA.

## Tese 3 — Modelo como lógica, não como arquivo ⭐ base do produto

O modelo não é um `.docx` com lacunas. É um conjunto de **blocos de cláusula**
com **variáveis tipadas** e **regras**:

```
se parte.tipo = PJ        → inclui cláusula "Representação legal"
se parte.tipo = PF        → inclui cláusula "Capacidade civil" + exige CPF
se contrato.prazo = indet → troca cláusula 5 pela versão "aviso prévio 30 dias"
se valor > 50.000         → torna "Garantia" obrigatória
```

Um modelo "Prestação de Serviços" cobre PF, PJ, MEI e estrangeiro, em vez de
quatro arquivos. Corrigir uma cláusula da biblioteca propaga para todo modelo
que a usa (por referência, como o contrato padrão do ExameQR) e nunca para
contrato já assinado.

Inclui o **linter jurídico**, que é o `conferirTexto` do ExameQR generalizado:
antes de publicar um modelo, o sistema aponta cláusula obrigatória ausente,
placeholder sem origem, campo entre colchetes, regra contraditória (parte PF
caindo em cláusula de CNPJ) e cláusula crítica sem resumo.

Isso não é visível para o cliente final, mas é o que resolve a "dor de cabeça do
desenvolvimento de contratos". É o motor; as teses 1 e 2 são o que se vende.

## Tese 4 — Lote a partir da base de funcionários

Conectar a base (CSV, planilha, API do sistema de folha ou banco externo em
leitura) e gerar **um contrato por linha** de uma vez: 40 admissões, o aditivo
de reajuste para todo um setor, o termo de LGPD para a empresa inteira. Cada
pessoa recebe o próprio link por WhatsApp ou e-mail, e o painel mostra o
progresso ("31 de 40 assinaram").

É o caso de uso mais caro de fazer à mão e o que o RH paga com mais facilidade.

## Tese 5 — Contrato vivo (pós-assinatura)

O contrato não morre ao ser assinado. O sistema guarda **vencimento, reajuste
(IPCA/IGP-M), renovação automática e aviso prévio**, avisa antes, e gera o
**aditivo ligado ao original** (o selo do original passa a mostrar "aditado em
...").

---

## Teses consideradas e deixadas de lado

| Ideia | Por que não agora |
|---|---|
| IA redige o contrato inteiro | Risco jurídico alto, e responsabilidade é do humano. IA entra como assistente: rascunho de resumo, sugestão de variáveis ao importar `.docx`, revisão do linter |
| Blockchain para registro | O hash + carimbo de tempo ICP-Brasil já prova integridade com reconhecimento legal. Blockchain acrescentaria custo e marketing, mas não acrescenta validade |
| Negociação/redline entre empresas | É CLM corporativo, um outro produto |

## Recomendação

**Identidade = Tese 1 + Tese 2** ("o contrato que quem assina entende, e que
qualquer um verifica"). **Motor = Tese 3**. **Primeiro cliente pagante = Tese 4**
(RH). **Retenção = Tese 5**.

### Decisões

| # | Decisão | Estado |
|---|---|---|
| 1 | Identidade = **bula + selo** (teses 1 e 2) | ✅ fechada (Davi, 16/out/2026) |
| 2 | Primeiro público = **RH** (modelos prontos: prestação de serviços PF/PJ/MEI, depois admissão) | ✅ por padrão no "pode fazer tudo" de 16/out; revisável |
| 3 | **Nome** do produto | ⏳ aberto; segue `contratos-saas` |
| 4 | Assinatura própria com **autenticação forte** (link + OTP + evidências + ciência), ICP-Brasil plugável | ✅ fechada (16/out/2026) |
