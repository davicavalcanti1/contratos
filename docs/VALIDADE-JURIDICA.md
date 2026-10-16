# Validade jurídica

> ⚠️ Este documento organiza a base legal para orientar o produto e **não é
> parecer**. Antes de vender com a promessa de "validade jurídica", ele precisa
> passar por um advogado, e o texto de marketing também.

## 1. Por que a assinatura eletrônica vale

| Norma | O que diz, para nós |
|---|---|
| **CC art. 107** | A forma do negócio é livre, salvo quando a lei exigir forma especial. A maioria dos contratos privados não exige. |
| **MP 2.200-2/2001, art. 10 §1º** | Documento assinado com certificado **ICP-Brasil** presume-se verdadeiro em relação ao signatário. |
| **MP 2.200-2/2001, art. 10 §2º** | Outros meios de comprovar autoria e integridade **também valem**, se as partes os admitirem como válidos. Daí a **cláusula de anuência** obrigatória em todo modelo (o linter exige). |
| **Lei 14.063/2020** | Define assinatura **simples**, **avançada** e **qualificada (ICP-Brasil)**. Rege a relação com o poder público, mas é a régua que o Judiciário usa para classificar também a assinatura entre particulares. |
| **CPC art. 784, III e §4º** (red. Lei 14.620/2023) | Contrato eletrônico é **título executivo** e **dispensa testemunhas** "quando sua integridade for conferida por provedor de assinatura". **Somos esse provedor.** É o que torna o selo e o dossiê centrais. |
| **CPC arts. 411 e 441** | Documento eletrônico é admitido como prova, e a autenticidade se presume quando a autoria é identificada por meio legalmente admitido. |
| **STJ, REsp 1.495.920/DF (2018)** | Reconheceu contrato eletrônico como título executivo mesmo sem testemunhas, antes da mudança do CPC. |
| **CDC arts. 46 e 54 §4º** | Ciência prévia do conteúdo e **destaque** para as cláusulas que limitam direito, a base da "bula" ([DIFERENCIAIS.md](DIFERENCIAIS.md), tese 1). |
| **LGPD (Lei 13.709/2018)** | Somos **operador** dos dados das partes. A organização cliente é a **controladora**, e o DPA é obrigatório, como no ExameQR. |

## 2. Níveis que o produto oferece

| Nível | Como o signatário se identifica | Para quê |
|---|---|---|
| **Eletrônica com autenticação forte** (padrão, assinatura própria) | link pessoal + OTP no e-mail/WhatsApp/SMS + evidências (IP, dispositivo, horário, geolocalização se permitida) + ciência por cláusula | a imensa maioria: prestação de serviço, trabalho, locação, termo de LGPD |
| **+ Biometria/documento** (opcional por modelo) | selfie + foto do documento, com prova de vida ❓ | valores altos, consumidor vulnerável, fraude recorrente |
| **Qualificada (ICP-Brasil)** (feito na Fase 6, por signatário) | o signatário assina o PDF com o próprio certificado A1/A3/nuvem e envia; o sistema confere a assinatura, que o arquivo é o contrato enviado, a cadeia até as raízes do ITI, a validade e o CPF. **Revogação não é consultada**, e o dossiê aponta o validar.iti.gov.br | quem exige presunção legal plena: escritório, cartório, contrato com o poder público |
| **gov.br** | assinador gov.br | é assinatura **avançada**, não ICP-Brasil (o certificado não sobe até as raízes do ITI). Quando o contrato pede ICP-Brasil, o sistema reconhece o gov.br e explica a recusa. Aceitar gov.br como método próprio é decisão em aberto |

**Classificação honesta:** a assinatura por OTP + evidências é tratada pelo
mercado como **eletrônica simples robustecida**, e há discussão se ela chega a
"avançada". O produto não deve prometer "avançada" sem um parecer. Deve prometer
o que pode provar: **autoria, integridade e ciência**, conferidas pelo
provedor, com dossiê.

## 3. O que guardamos (o dossiê)

Para cada contrato assinado, baixável pelo cliente a qualquer momento:

1. **PDF original** (o que foi enviado) e **SHA-256** dele, calculado na geração.
2. **PDF final** com página de assinaturas, QR e código de verificação em cada página.
3. **Trilha de eventos** encadeada por hash (ver DOMINIO §6), com horário do servidor.
4. **Ciências** por cláusula crítica, com horário e tempo de leitura.
5. **Carimbo do tempo** RFC 3161 sobre o hash do PDF final (feito na Fase 6). O
   token `.tsr` vai no dossiê e se confere com `openssl ts -verify`, sem o
   nosso sistema. Só tem **fé legal** se a ACT for credenciada na ICP-Brasil
   (`CARIMBO_ICP_BRASIL=1`, exige contrato com uma ACT). Com ACT de fora (como a
   FreeTSA, usada em teste), é prova de terceiro, mas sem presunção legal, e o
   dossiê diz qual é o caso.
7. **PDF assinado com certificado**, byte a byte, para quem assinou com ICP-Brasil.
6. **Manifesto em JSON** (máquina) + **relatório em PDF** (humano, para juntar
   num processo).

A guarda é no mínimo pelo prazo prescricional aplicável. Distratar ou cancelar a
conta **não apaga** a prova, que é exportada antes. A retenção exata precisa ser
fechada com o advogado e entrar no DPA.

## 4. Cláusulas que todo modelo carrega (o linter exige)

- **Anuência à assinatura eletrônica**: as partes reconhecem o meio como válido
  (MP 2.200-2 art. 10 §2º).
- **Título executivo** (quando couber): referência ao CPC art. 784, III e §4º.
- **Foro** e **comunicações** (e-mail/WhatsApp como canal válido de notificação).
- **LGPD**: tratamento dos dados das partes para execução do contrato.

## 5. O que o sistema NÃO faz

| Situação | Por quê | O que o produto faz |
|---|---|---|
| **Compra e venda de imóvel** acima de 30 salários mínimos | exige **escritura pública** (CC art. 108) | gera a **minuta** e o instrumento particular de promessa (compromisso de compra e venda), mas não a escritura |
| **Ato notarial eletrônico** (escritura, procuração pública) | só pelo **e-Notariado** (Provimento CNJ 100/2020, hoje no Código Nacional de Normas, Prov. 149/2023) | o cartório usa o sistema para minutas e gestão. O ato em si continua no e-Notariado |
| **Reconhecimento de firma** | é ato do tabelião | não simulamos |
| Contratos que a lei exige **forma especial** (ex.: alguns atos de família) | idem | o linter do modelo pode marcar o tipo como "só minuta" |

Dizer isso abertamente é parte do posicionamento para escritórios e cartórios:
é o que separa um produto sério de quem promete "validade jurídica para tudo".

## 6. Pendências jurídicas (para o advogado)

- [ ] Redação da cláusula de anuência e da de título executivo.
- [ ] Rodapé da "bula": o resumo **não substitui** o texto integral, e ele não
      pode criar obrigação diferente da do texto.
- [ ] Se a ciência por cláusula pode ser apresentada como cumprimento do CDC 54 §4º.
- [ ] Prazo de guarda do dossiê e o que acontece no encerramento da conta.
- [ ] O selo público: o que pode aparecer sem violar a LGPD (proposta: nomes
      parciais, documentos mascarados, valores ocultos).
- [ ] DPA padrão (organização = controladora, nós = operador), aproveitando o do ExameQR.
