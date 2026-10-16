# Contrato vivo: vigência, reajuste, aditivo e distrato (Fase 5)

> Estado em 16/out/2026: funcionando sem banco e sem e-mail real, como as
> fases anteriores. A calculadora de reajuste consulta o Banco Central de
> verdade.

## A regra que manda em tudo

**O contrato assinado nunca é editado.** O texto é prova. Toda mudança é um
documento **novo** (termo aditivo ou distrato), assinado pelas mesmas pessoas e
ligado ao original. O que muda no original é só o **registro** da vigência
(término, valor) e o status, e só depois que o novo documento for assinado
por todos.

## Vigência

O modelo declara, em `vida`, de onde vem cada coisa:

```json
"vida": {
  "inicio": "contrato.data_inicio",
  "prazo": { "campo": "contrato.prazo_tipo", "determinado": "determinado" },
  "duracao_meses": "contrato.duracao_meses",
  "aviso_previo_dias": "contrato.aviso_previo_dias",
  "valor": "contrato.valor",
  "indice": "contrato.indice_reajuste",
  "reajuste": { "a_cada_meses": 12, "quando": <a mesma regra do parágrafo de reajuste> }
}
```

- "12 meses a contar de 01/11/2026" termina em **31/10/2027**, e 31/01 + 1 mês
  dá 28/02 (ou 29 no bissexto).
- O reajuste só existe se o parágrafo de reajuste entrou no contrato, e só
  conta o aniversário que cai dentro da vigência.
- Datas são **dias de calendário** (`AAAA-MM-DD`, dia de Brasília). Elas nunca
  passam por fuso: foi assim que o painel chegou a mostrar 01/11 como 31/10
  (achado no teste visual, corrigido).
- Modelo sem `vida` (o termo do colaborador, por exemplo) não entra na agenda.

## Agenda

Roda ao subir o servidor e de hora em hora.

| Quando | O que acontece |
|---|---|
| 30 e 7 dias antes do término | e-mail para quem administra ou emite + webhook `contrato.vencendo` |
| 30 dias antes do aniversário de reajuste | e-mail + webhook `contrato.reajuste_devido` |
| passou do término | status **encerrado** + evento na trilha + webhook `contrato.encerrado` |

Cada aviso tem uma chave com a data a que se refere. Rodar a agenda dez vezes
no mesmo dia não manda nada duas vezes, e uma prorrogação gera avisos novos
porque o término mudou. Quem só tem acesso de leitura não recebe e-mail.

A tela **Agenda** do painel lista vencimentos e reajustes dos próximos 30, 90,
180 ou 365 dias, com atalho para prorrogar ou reajustar, e os encerrados recentes.

## Termo aditivo

Gerado no detalhe do contrato ("Mudar ou encerrar este contrato"). Pode, em um
só termo:

- **prorrogar** o prazo (a nova data precisa ser depois do término atual);
- **alterar o valor**, por reajuste pelo índice ou por acordo;
- **alterar o objeto**.

O texto copia **literalmente** a qualificação das partes do contrato assinado e
o identifica pelo título, pela data e pelo código de verificação. Assinado o
aditivo, o original passa a ter o novo término e o novo valor, com o histórico
das mudanças. O selo do original mostra "Aditado por documento assinado em …",
com link.

### Calculadora de reajuste

Busca a variação mensal do índice no **Sistema Gerenciador de Séries do Banco
Central** (IPCA = série 433, IGP-M = série 189), compõe o acumulado e calcula o
novo valor. O período padrão são os 12 meses publicados antes do aniversário (o
índice de um mês sai no mês seguinte).

O índice, o período, o percentual e a fonte vão escritos no aditivo: "IGP-M/FGV
acumulado de 10/2025 a 09/2026, 3,35% (Banco Central do Brasil, SGS série 189)".

A API do Banco Central é **intermitente**: no teste, a mesma consulta deu 502
depois de 17 s e, logo em seguida, 200 em 0,6 s. Por isso:
- são duas tentativas, com `User-Agent` identificado;
- se as duas falharem, a tela diz isso e a pessoa digita o percentual. **O
  reajuste nunca depende da integração.**

## Distrato

Encerra o contrato por acordo (CC art. 472). Tem data de encerramento, quitação
total ou com pendências listadas, dispensa opcional da multa, e mantém sigilo e
LGPD valendo depois.

**O distrato extingue o contrato na DATA combinada, não na assinatura.** Até lá,
as obrigações continuam ("até essa data, as obrigações seguem sendo
cumpridas normalmente", diz a cláusula). Então:

- distrato assinado com data futura: o original continua **vigente**, o término
  passa a ser a data do distrato, e o selo diz "Encerra em DD/MM por distrato";
- na data, a agenda marca **distratado** (não "encerrado"), sem aviso de
  "vence em 7 dias" no caminho, porque o fim foi combinado;
- distrato com data de hoje ou passada: distratado na assinatura;
- contrato com distrato assinado não recebe mais aditivo.

A primeira versão marcava "distratado" na hora da assinatura. O teste visual do
selo mostrou a contradição com o próprio texto do distrato, e a regra foi
corrigida.

## Regras de segurança do fluxo

- Só contrato **assinado** recebe aditivo ou distrato.
- Um derivado por vez: com um aditivo ou distrato aguardando assinatura, não
  se gera outro.
- Aditivo e distrato não aparecem em "Novo contrato" nem em lote: nascem de um
  contrato assinado, pela rota própria.
- Contam no limite do plano como qualquer contrato.

## API

| Rota | O quê |
|---|---|
| `POST /v1/contratos/:id/aditivo` | `{ campos: { vigencia, prorroga?, nova_data_fim?, altera_valor?, novo_valor?, motivo_valor?, indice_texto?, altera_objeto?, novo_objeto? } }` |
| `POST /v1/contratos/:id/distrato` | `{ campos: { data_encerramento, quitacao: total\|com_pendencias, pendencias?, dispensa_multa? } }` |
| `GET /v1/contratos/:id` | agora com `vida` (início, fim, valor, próximo reajuste, histórico), `origem`, `derivados`, `distrato` |
| `GET /v1/agenda?dias=90` | vencimentos, reajustes e encerrados |
| `GET /v1/indices/:IPCA\|IGP-M?para=AAAA-MM-DD` | acumulado do período padrão antes da data (ou `?de=AAAA-MM&ate=AAAA-MM`) |

Webhooks novos: `contrato.aditado`, `contrato.distratado`, `contrato.vencendo`,
`contrato.reajuste_devido`, `contrato.encerrado`.

## Pendências

- [ ] Texto do aditivo e do distrato revisado por advogado.
- [ ] Renovação automática como opção de modelo (hoje o contrato determinado
      termina e a agenda avisa antes).
- [ ] Reajuste aplicado sem aditivo, quando o contrato já prevê o índice
      (há quem entenda que não precisa de termo). Decisão jurídica antes de código.
- [ ] INPC e outros índices, se algum cliente pedir.
