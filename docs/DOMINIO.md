# Domínio

Entidades e regras, sem depender de banco. Quando o banco vier, cada entidade vira
tabela com `organizacao_id`, exceto as da biblioteca oficial, que são globais.

## 1. Mapa

```
Organização ─┬─ Usuário (papel)
             ├─ Área
             ├─ FonteDeDados ── Mapeamento (coluna → variável)
             ├─ Parte (diretório interno; PF | PJ | …)
             ├─ Cláusula ── VersãoDeCláusula
             ├─ Modelo ──── VersãoDeModelo ── Bloco (→ VersãoDeCláusula, regra)
             │                              └─ Variável (tipo, origem)
             └─ Contrato ─┬─ Signatário ── SessãoDeAssinatura ── Ciência (por cláusula)
                          ├─ Evento (trilha append-only)
                          ├─ Documento (PDF original, PDF assinado, dossiê)
                          ├─ Selo (código público de verificação)
                          └─ Contrato filho (aditivo | distrato)

Biblioteca oficial (Developer): Cláusula e Modelo com organizacao_id = null
```

## 2. Tipos de parte

O "CPF, CNPJ etc." do pedido vira um tipo de primeira classe, porque ele muda
**cláusulas**, não só um campo.

| Tipo | Identificador | O que muda no contrato |
|---|---|---|
| `pf` | CPF | qualificação completa (nacionalidade, estado civil, profissão, RG) |
| `pj` | CNPJ | razão social, sede, **representante legal** (que é uma PF que assina) |
| `mei` | CNPJ + CPF do titular | PJ com a qualificação do titular; regras próprias de serviço |
| `estrangeiro` | passaporte / RNE | idioma e foro; possível versão bilíngue ❓ |
| `pf_representada` | CPF + CPF do representante | menor ou incapaz: assina o responsável legal |

Uma PJ **nunca assina sozinha**: assina o representante, que é PF. O contrato
guarda os dois, quem é a parte e quem assinou por ela. Isso também vale para o
procurador (com procuração anexada ❓).

## 3. Motor de modelos

### Variável
```
{ chave: "parte.cpf", rotulo: "CPF do contratado", tipo: "cpf",
  origem: "parte" | "organizacao" | "parametro" | "fonte" | "manual" | "calculada",
  obrigatoria: true, formato: "000.000.000-00" }
```
Tipos: `texto`, `cpf`, `cnpj`, `moeda`, `data`, `numero`, `endereco`, `enum`,
`por_extenso` (calculada: R$ 1.500,00 → "mil e quinhentos reais").

O tipo **valida antes de gerar**: CPF com dígito errado bloqueia. Valor monetário
sai sempre com o número e o extenso, que é o padrão de contrato.

### Bloco e regra
O modelo é uma lista ordenada de blocos. Cada bloco aponta para **uma versão de
cláusula** e, opcionalmente, para uma regra:

```
bloco 4  → cláusula "Representação legal" v3      quando parte.tipo in [pj, mei]
bloco 5  → cláusula "Prazo determinado" v1        quando contrato.prazo = determinado
bloco 5' → cláusula "Prazo indeterminado" v2      quando contrato.prazo = indeterminado
```

As regras são **declarativas** (campo, operador, valor), com e/ou, sem código
livre. É o que permite ao linter provar coisas sobre o modelo (ex.: "existe uma
combinação em que nenhuma cláusula de prazo entra").

A numeração das cláusulas é **recalculada** depois das regras. Removido um bloco,
o resto não fica com o "5.3" apontando para algo que sumiu (referências cruzadas
usam a chave, não o número).

### Cláusula
```
{ chave: "multa_rescisoria", titulo: "Multa rescisória",
  texto: "…{{contrato.multa_percentual}}…",
  resumo_simples: "Se você cancelar antes do prazo, paga {{…}}% do valor restante.",
  critica: true,              # exige ciência individual na assinatura
  base_legal: "CC art. 413",  # aparece para o redator e no linter
  versao: 4 }
```

### Precedência (herdada do ExameQR, generalizada)
- **Texto**: versão da organização (se ela não herda) → versão vigente oficial.
- **Parâmetros**: valor do contrato → padrão da organização → padrão do modelo
  oficial.

### Linter (antes de publicar uma versão)
Graves (bloqueiam): placeholder sem origem · texto entre colchetes · combinação de
regras sem cláusula obrigatória (partes, objeto, preço, foro, assinatura) ·
cláusula crítica sem resumo · ausência da cláusula de anuência à assinatura
eletrônica (MP 2.200-2 art. 10 §2).
Avisos: sem referência ao CPC 784 (título executivo) · resumo mais longo que o
texto · variável declarada e nunca usada.

## 4. Ciclo de vida do contrato

```
rascunho ──gerar──▶ gerado ──(aprovar?)──▶ enviado ──▶ parcialmente_assinado ──▶ assinado
   │                  │                      │                                    │
   └──── descartar    └── cancelar           ├──▶ recusado                        ├──▶ aditado (filho)
                                             ├──▶ expirado (prazo do link)        ├──▶ distratado (filho)
                                             └──▶ cancelado                       └──▶ encerrado (vencimento)
```

Regras invariantes (garantidas no banco, não só na tela, como o
`trg_contratos_protege`):

1. A partir de `gerado`, o **texto e o hash do PDF original não mudam**. Corrigir
   significa cancelar e gerar outro.
2. `assinado` **não volta**. Aditivo e distrato são contratos novos, ligados ao
   original.
3. Só o módulo de Assinatura (ou o webhook do provedor) declara
   `assinado`/`recusado`/`expirado`. A tela não declara.
4. `cancelado` é sempre permitido antes de `assinado`, porque é o único destino
   que não afirma nada sobre a assinatura.

## 5. Signatários e ordem

- Cada signatário tem papel (`parte`, `representante`, `testemunha`,
  `interveniente`, `aprovador_interno`) e canal (`email`, `whatsapp`, `sms`).
- Ordem **paralela** (padrão) ou **sequencial** (a empresa assina por último,
  depois de ver que o outro lado assinou).
- Testemunhas são **opcionais**: o CPC 784 §4º as dispensa quando a integridade é
  conferida pelo provedor (ver VALIDADE-JURIDICA). Ficam disponíveis para quem
  quiser.
- E-mail sintético ou inválido bloqueia o envio (herdado do `emailReal`).

## 6. Evento (a trilha)

Append-only: nunca se edita nem se apaga. Cada evento traz quem, o quê, quando
(horário do servidor), IP, user-agent e hash do evento anterior, encadeado para
que a remoção de um evento do meio seja detectável.

Eventos mínimos: `contrato.gerado`, `link.enviado`, `link.aberto`,
`otp.enviado`, `otp.validado`, `clausula.ciencia`, `documento.lido_ate_o_fim`,
`assinatura.aceita`, `assinatura.recusada`, `documento.selado`,
`selo.verificado`.
