# Contratos em lote a partir da planilha (Fase 3)

> Estado em 16/out/2026: funcionando sem banco e sem e-mail real, como a Fase 2.
> Tela de teste em `/dev/lotes`; o painel de verdade da organização é a Fase 4.

## Como testar

```bash
npm start            # http://localhost:3000/dev/lotes
```

Escolha o modelo, suba uma planilha (tem um exemplo na própria tela, com duas
linhas propositalmente erradas), confira as colunas, veja a prévia, informe
quem assina pela empresa e envie. Os links aparecem na caixa de saída do `/dev`.

## O fluxo

```
planilha (.xlsx/.csv) → colunas → conferência linha a linha → envio → acompanhamento
                                                                  └→ link único para a empresa assinar tudo
```

**Planilha.** Lê o que o Excel brasileiro produz de verdade:
- CSV com `;`, em Windows-1252 ou UTF-8 com BOM;
- campos com aspas, `;` e quebra de linha dentro;
- XLSX com data, número e fórmula;
- linhas em branco no meio. O número de cada linha é o mesmo que o Excel mostra.

Limite de 2.000 linhas por lote.

**Colunas.** O sistema sugere a coluna de cada informação pelo nome
("Nome Completo" → nome do colaborador, "Salário" → valor). Ele não confunde
"CPF do representante" com o CPF do contratado. Cada campo pode vir de uma
coluna, ter **o mesmo valor para todos** (foro, forma de pagamento) ou ficar
com o padrão do modelo. O mapeamento confirmado é **lembrado** no próximo lote
com as mesmas colunas.

**Conferência.** Cada linha passa pelo **mesmo motor** da geração, então o que
a prévia diz que está pronto, gera. Linha com problema não trava o lote: fica
de fora com o motivo ("CPF do colaborador: CPF inválido"). O que o sistema
corrige sozinho aparece como aviso, como o CPF que o Excel guardou como número
e perdeu o zero à esquerda (`1234567890` → `01234567890`). Também avisa quando
o mesmo e-mail aparece em duas linhas. Se faltar algo no **cadastro da
empresa** (ex.: e-mail do encarregado de dados), nada sai, porque o problema
vale para todas as linhas.

**Quem assina por linha** vem do modelo (`signatarios_da_parte`). Num contrato
com PJ quem assina é o representante, não a empresa. O linter prova que toda
combinação de regras tem alguém para assinar.

## A empresa assina tudo de uma vez

Sem isto, um lote de 40 contratos obriga o diretor a abrir 40 links. O
representante recebe **um** link (`/lote/<token>`) e segue estes passos:

1. confirma **um** código;
2. lê o **modelo**: os campos que mudam aparecem como «nome do colaborador», e
   as variações como "Só quando o tipo do contratado é pessoa jurídica, entra
   em 8 de 40 contratos";
3. confere a **tabela** com os dados de cada contrato;
4. dá ciência a cada cláusula em destaque e assina todos.

Cada contrato recebe **na própria trilha** os mesmos eventos de uma assinatura
individual (código validado, ciência por cláusula, leitura, assinatura), com
`via_lote` e o horário original. O dossiê de cada contrato fica completo
sozinho, sem depender do lote.

## Acompanhamento

Totais ("12 de 40 assinados por todos"), a situação de cada linha, quem
recusou e por quê, e o selo de cada contrato concluído. Duas ações:
- **Lembrar quem não assinou**: manda um link novo; o anterior deixa de valer;
- **Relatório**: CSV com `;` e BOM, que abre direto no Excel com acento certo.

## LGPD

A planilha inteira só existe até o lote ser criado (e no máximo 24 h, se o RH
desistir no meio). Depois disso fica só o que foi para cada contrato. A
prévia não guarda nada.

## API

| Rota | O quê |
|---|---|
| `POST /v1/lotes/planilha?nome=arquivo.xlsx` | corpo = o arquivo, cru → `planilha_id`, colunas, amostra |
| `GET /v1/lotes/planilha/:id/sugestao?modelo=` | mapeamento sugerido (ou o salvo) + variáveis do modelo |
| `POST /v1/lotes/previa` | `{ planilha_id, modelo, mapeamento }` → linha a linha |
| `POST /v1/lotes` | `{ …, nome, assinante_organizacao?: {nome, email}, prazo_dias? }` → gera e envia |
| `GET /v1/lotes`, `GET /v1/lotes/:id` | lista e progresso |
| `POST /v1/lotes/:id/lembrar` | link novo para quem falta |
| `GET /v1/lotes/:id/relatorio.csv` | relatório para o Excel |
| `/api/lote/:token/*` | representante: `codigo`, `codigo/validar`, `conteudo`, `ciencia`, `leitura`, `assinar` |

## Modelos

- `prestacao_servicos`: PF, PJ ou MEI. Na PJ, quem assina é o representante.
- `termo_confidencialidade_colaborador` (**novo**): sigilo, LGPD, uso dos
  recursos corporativos e devolução, para a empresa inteira assinar de uma
  vez. Não tem cláusula de foro, de propósito: em matéria trabalhista a
  competência é a da CLT (art. 651), e eleição de foro não vale. Também não
  afirma ser título executivo (`titulo_executivo: false`).

## Pendências

- [ ] Conector de API/banco do sistema de folha (hoje só planilha).
- [ ] Contrato de trabalho (CLT) como modelo, que é o lote de admissão
      propriamente dito. Exige revisão trabalhista antes.
- [ ] Texto do termo do colaborador revisado por advogado trabalhista.
