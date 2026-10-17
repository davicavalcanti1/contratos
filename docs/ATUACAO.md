# Atuação: para quem, com o quê, e como entrar

> Rascunho de 17/out/2026, para decidir com o Davi. Complementa
> [VISION.md](VISION.md) (a dor) e [DIFERENCIAIS.md](DIFERENCIAIS.md) (as teses).
> Aqui a pergunta é prática: que empresas, que oferta, que ordem.

## 1. O recorte: pequenas e médias empresas que contratam gente sem ser CLT

Não "contratos em geral". Empresas de 10 a 300 pessoas que, para operar,
contratam **prestadores recorrentes** (PJ, MEI, autônomos) e **colaboradores**,
e repetem o mesmo contrato dezenas ou centenas de vezes por ano.

| Segmento | Quem elas contratam assim | Volume típico/ano | Por que dói |
|---|---|---|---|
| **Clínicas, laboratórios, hospitais-dia** | médicos, técnicos, enfermagem PJ; recepção CLT | 30 a 300 | pejotização é o passivo trabalhista nº 1 do setor; termo de sigilo é obrigação da LGPD com dado de saúde |
| **Agências, estúdios, consultorias, TI** | designers, devs, redatores PJ/MEI | 20 a 150 | time inteiro é PJ; contrato vago vira vínculo |
| **Escolas, cursos, academias** | professores, personal trainers, instrutores | 20 a 200 | horário fixo + subordinação = risco; alta rotatividade |
| **Franquias e redes de serviço** (estética, odonto, pet) | profissionais por unidade | 50 a 500 | o mesmo contrato replicado em N unidades, cada uma editando à mão |
| **Contabilidades e BPOs de RH** | fazem isso para dezenas de clientes | centenas | canal: um contador atende 50 empresas |

O que há em comum: contrato **repetitivo**, **com dado que já existe em
planilha**, e um **risco jurídico que o dono não enxerga** até receber a
notificação.

Fora do recorte, por enquanto: imobiliárias (locação precisa de outro modelo e
de fiador/garantias), varejo com consumidor final (CDC pesado, outro produto),
grandes empresas (compram CLM com negociação e aprovação em níveis).

## 2. A dor que vendemos (a oculta, não a óbvia)

A óbvia: "perco tempo com Word e e-mail". Todo concorrente vende isso, e o
dono acha que resolve com um modelo no Drive.

A oculta, em três frases que o dono entende:

1. **"Seu PJ pode virar empregado na Justiça."** A tese "era CLT disfarçado"
   depende de provar subordinação; a defesa depende de provar autonomia
   acordada **e compreendida**. Hoje a empresa tem um PDF assinado e nada mais.
2. **"Seu funcionário vazou dado e você não tem como provar que ele sabia."**
   LGPD exige treinar e documentar. Um termo assinado sem ler não documenta.
3. **"Quando a relação azeda, a pessoa diz que não leu."** Sem registro do
   contrário, a palavra dela vale tanto quanto a sua.

O produto responde com o **dossiê**: a pessoa confirmou a identidade, leu até
o fim, deu ciência individual na cláusula de autonomia, na multa, no sigilo,
com horário e tempo de leitura, e tudo está encadeado por hash. Não elimina o
risco; muda quem precisa provar o quê.

Frase de posicionamento para testar: **"Contratos que a sua equipe entende e
que você consegue provar."**

## 3. A oferta: produto + modelos prontos para o nicho

Quem é pequeno não quer "um motor de modelos". Quer o contrato certo, pronto.
A oferta então é:

**O sistema** (painel, assinatura com bula, selo, lote, agenda, API) **mais um
kit de modelos do nicho**, redigidos por nós e revisados por advogado:

- Prestação de serviços PJ/MEI/PF (existe) — a base para médico, dev, professor
  etc., com variáveis por nicho (CRM/conselho, carga horária, local, escala).
- Termo de confidencialidade e LGPD do colaborador (existe).
- Termo de responsabilidade por equipamento e acesso (pequeno, pede-se muito).
- Contrato de parceria/comissão (vendedor externo, representante).
- Aditivo e distrato (existem, nascem do original).

Modelo novo é trabalho nosso no começo, não do cliente. Isso é uma vantagem:
**onboarding = a gente migra os seus 2 ou 3 contratos para o sistema, com
bula, em uma semana.** O editor de modelos para o cliente vem depois, quando
houver padrão nos pedidos.

### Planos (hipótese inicial)

| | Essencial | Profissional | Rede/Contabilidade |
|---|---|---|---|
| Contratos/mês | até 50 | até 300 | por organização |
| Modelos do kit | 2 | todos | todos + próprios |
| Lote pela planilha | não | sim | sim |
| API e webhooks | não | sim | sim |
| Carimbo do tempo ICP-Brasil | opcional | incluso | incluso |
| Multi-organização | não | não | sim (uma conta, N clientes) |

Preço: âncora abaixo de um Clicksign/ZapSign equivalente **no plano de
entrada**, e acima no profissional, justificado pelo dossiê e pelos modelos. A
cobrar por contrato gerado, não por usuário (empresa pequena odeia pagar por
assento). Definir número depois de 5 conversas com donos.

## 4. Como a pessoa que assina vive isso

Para o signatário não muda nada que ele precise aprender: link, código, leitura,
nome, pronto. O que muda é a sensação: ele **entendeu** o que assinou, em vez de
rolar 12 páginas de juridiquês. Isso reduz recusa e volta de perguntas, que é
um custo escondido do RH. É também o que faz o emissor parecer sério.

## 5. Canais de entrada

1. **A rede do ExameQR.** Clínicas que já usam o módulo de contratos de lá são
   o primeiro cliente natural: dor conhecida, confiança existente, dados já
   estruturados. Começar por elas, de graça por 60 dias, em troca de feedback
   e de um caso de uso para mostrar.
2. **Contabilidades e BPOs de RH.** Um contador atende dezenas de PMEs e é quem
   o dono ouve. O plano Rede é para ele: uma conta, N organizações, e ele revende
   ou indica. É o canal que escala sem equipe de vendas.
3. **Advogados trabalhistas de empresa.** Eles vendem a dor oculta melhor que
   nós. Oferecer a revisão dos modelos em parceria e indicação cruzada.
4. **Conteúdo direto na dor:** "o que acontece se o seu PJ te processar",
   "o termo de LGPD que você fez seus funcionários assinarem não vale". Site já
   está pronto para receber.

## 6. O que falta no produto para esse recorte

Em ordem do que trava a primeira venda:

1. **E-mail real** (Resend) e **hospedagem com domínio**. Sem isso ninguém de
   fora recebe link.
2. **Kit de modelos do nicho saúde** (médico PJ, técnico, termo de equipamento),
   passados pelo linter e por advogado. É redação, não código.
3. **Variáveis por nicho no modelo de prestação de serviços** (conselho
   profissional, carga horária, local, escala) para o contrato médico não
   parecer genérico.
4. **Editor de modelos no painel**, versão mínima: o cliente edita o resumo em
   palavras simples e os parâmetros; o texto jurídico fica conosco. Depois,
   cláusulas próprias.
5. **Plano Rede**: um usuário com acesso a várias organizações (hoje o
   developer é o único papel multi-org, e é interno).
6. **Cobrança**: nada existe. Começar manual (Pix/boleto mensal) e só automatizar
   com 10 clientes pagantes.

## 7. Decisões pedidas ao Davi

- Confirmar o recorte: PMEs que contratam PJ/colaboradores, começando por saúde.
- Nome do produto, para domínio e e-mail.
- Quem revisa os modelos (advogado parceiro ou contratado).
- Aceitar o canal contabilidade como prioridade de produto (plano Rede) ou deixar
  para depois.
