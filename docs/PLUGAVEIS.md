# Plugáveis: carimbo do tempo e certificado ICP-Brasil (Fase 6)

> Estado em 16/out/2026. Carimbo do tempo e ICP-Brasil funcionando e testados
> contra serviços e padrões reais. O **ZapSign ficou adiado** por decisão: não
> há conta para testar, e a assinatura própria já faz mais que ele. O encaixe
> está pronto (ver o fim).

## Carimbo do tempo (RFC 3161)

Sem carimbo, os horários do dossiê são os do nosso servidor. Com carimbo, uma
Autoridade de Carimbo do Tempo (ACT) assina que **aquele hash existia naquele
instante**. Se a ACT for credenciada na ICP-Brasil, o horário tem presunção
legal (MP 2.200-2/2001).

**O que é carimbado:** o SHA-256 do **PDF final**, o assinado, com QR e página
de assinaturas. O carimbo é pedido logo depois de selar e **não segura a
assinatura**: se a ACT não responder, o contrato fica com "carimbo pendente"
e um ciclo tenta de novo a cada 10 minutos.

**Conferência independente.** O token `.tsr` sai no painel e na API
(`GET /v1/contratos/:id/carimbo.tsr`), e qualquer perito confere sem o nosso
sistema:

```bash
openssl ts -verify -data contrato-assinado.pdf -in carimbo.tsr -CAfile <cadeia da ACT>
```

**Testado de verdade:**
- FreeTSA e DigiCert responderam; o token foi conferido (imprint, nonce e
  assinatura da ACT); hash errado e um único bit adulterado foram recusados;
- `openssl ts -verify` deu **OK** sobre o PDF final baixado do próprio sistema,
  e **FAILED** (message imprint mismatch) sobre um documento alterado.

**Configuração:**

| Variável | O quê |
|---|---|
| `CARIMBO_URL` | endereço RFC 3161 da ACT |
| `CARIMBO_NOME` | nome para mostrar no dossiê |
| `CARIMBO_ICP_BRASIL=1` | **só** se a ACT for credenciada na ICP-Brasil |
| `CARIMBO_USUARIO`, `CARIMBO_SENHA` | se a ACT exigir autenticação (as ICP-Brasil costumam exigir contrato) |

Fora de produção, sem `CARIMBO_URL`, usa a **FreeTSA**, gratuita e marcada em
todo lugar como "fora da ICP-Brasil". `CARIMBO_URL=` (vazio) desliga. Em
produção, sem `CARIMBO_URL`, fica desligado.

## Assinatura com certificado ICP-Brasil

Para quem precisa de assinatura **qualificada** (escritório, cartório, contrato
com o poder público), o método é escolhido **por signatário** no envio:
`metodo: 'icp'`, com o **CPF**, que é como o certificado é conferido.

**Fluxo de quem assina:** entra pelo link, confirma o código e lê com a bula,
dando ciência em cada cláusula em destaque, como todo mundo. Depois:

1. **baixa o PDF** do contrato;
2. **assina o PDF com o próprio certificado** (Adobe com A1/A3, assinador da
   certificadora, certificado em nuvem);
3. **envia o arquivo assinado.**

Por que upload e não assinatura no navegador: o navegador não fala com token A3
sem plugin, e o upload funciona com qualquer certificado e qualquer ferramenta.

**O que o sistema confere (e diz o motivo quando recusa):**

| Conferência | Recusa quando |
|---|---|
| a assinatura cobre o arquivo inteiro | algo foi acrescentado depois de assinar |
| o arquivo começa **exatamente** pelo contrato enviado (assinatura PAdES por atualização incremental) | assinou outro documento, editou, ou "imprimiu para PDF" |
| o CMS confere com a chave do certificado | arquivo ou assinatura adulterados |
| a cadeia sobe até uma **raiz oficial do ITI** (`certs/icp-brasil`) | certificado de fora da ICP-Brasil; a assinatura **gov.br** é reconhecida e explicada à parte (é avançada, não qualificada) |
| o certificado estava válido no momento da assinatura | certificado vencido ou ainda não válido |
| o CPF do certificado (campo oficial, OID 2.16.76.1.3.1) é o do signatário | certificado de outra pessoa |

Tentativa recusada fica na trilha com o motivo. O **arquivo assinado é
guardado byte a byte**, baixável no painel e na API
(`GET /v1/contratos/:id/assinaturas/:sid/arquivo`), e o PDF final e o dossiê
registram o certificado, a cadeia e o hash desse arquivo.

**O que NÃO é conferido aqui: revogação (LCR/OCSP).** Um certificado revogado
depois de emitido passaria. O dossiê diz isso e aponta o validador oficial do
ITI, **https://validar.iti.gov.br**, para a validação completa (revogação e
política de assinatura). Consultar LCR/OCSP é o próximo passo natural, se a
operação pedir.

**Como foi testado:**
- uma ICP de teste (raiz, AC intermediária e titular com CPF no campo oficial)
  e assinaturas PAdES montadas como as ferramentas reais;
- o caminho certo e cada fraude: outro documento, contrato editado, byte
  alterado, conteúdo acrescentado, certificado vencido, raiz desconhecida,
  certificado de outra pessoa e PDF sem assinatura;
- **contraprova com o OpenSSL** (`openssl cms -verify`), que aceitou a
  assinatura com a raiz certa e recusou com a raiz errada e com o conteúdo
  alterado. O verificador segue o padrão, não só o próprio teste;
- fluxo completo no Chrome: o signatário enviou um PDF sem assinatura, recebeu
  a mensagem, enviou o assinado, e o contrato foi selado e carimbado.

**Ainda não testado com certificado ICP-Brasil real:** não há um disponível
aqui. Antes de vender assinatura qualificada, assine um contrato com um A1 ou
A3 de verdade (Adobe) e confira no validar.iti.gov.br.

**Raiz de teste:** fora de produção, `ICP_RAIZ_TESTE=<arquivo .pem>` acrescenta
uma raiz para testar sem certificado real. Em produção é ignorada.

## ZapSign (adiado)

Encaixa como um terceiro método por signatário (`metodo: 'zapsign'`): o envio
cria o documento lá, o webhook deles fecha a assinatura, e o PDF que volta vira
a prova. A assinatura própria já faz mais (bula, selo, lote, carimbo), então ele
só serve a quem já usa ZapSign. Implementar quando houver conta para testar
contra o serviço real.

## Testes

`test/carimbo.test.js` (RFC 3161 com uma ACT local, sem rede) e `test/icp.test.js` (verificador ICP), `test/plugaveis.test.js` (no
fluxo, pelo HTTP), `test/apoio-icp.js` (a ICP de teste).
