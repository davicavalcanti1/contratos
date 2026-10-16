# contratos-saas (nome provisório)

SaaS de contratos, multi-tenant e independente: modelos inteligentes, contrato
gerado a partir dos dados da empresa e assinatura com validade jurídica.

> **Fase atual: 1 — motor** (sem banco, sem tela, sem assinatura). Origem: o
> módulo de contratos do ExameQR (`exam-qr-system`), generalizado.

## Rodar

```bash
npm install
npm test                  # 24 testes: tipos, montagem, linter, PDF
npm run lint:modelos      # linter jurídico em todos os modelos da biblioteca
npm run exemplos          # gera saida/*.pdf a partir de exemplos/*.json
```

`exemplos/com-erros.json` é recusado de propósito: mostra o motor dizendo **o
que falta e onde resolver**, em vez de mandar lacuna para assinatura.

## O que tem aqui

| Caminho | O quê |
|---|---|
| `biblioteca/clausulas.json` | cláusulas versionadas, com resumo simples (bula), marca de crítica e base legal |
| `biblioteca/modelos/` | modelos = blocos de cláusula + regras + variáveis tipadas. `prestacao_servicos` cobre PF, PJ e MEI, prazo determinado ou não |
| `src/motor/tipos.js` | tipos de variável: CPF/CNPJ com dígito, moeda com extenso, data, endereço, enum… |
| `src/motor/regras.js` | regras declarativas (`eq`, `in`, `gte`, `e`/`ou`/`nao`) |
| `src/motor/montar.js` | modelo + dados → contrato numerado, com `faltando`/`invalidos` e hash do conteúdo |
| `src/motor/linter.js` | confere o modelo em **todas** as combinações de regras antes de publicar |
| `src/motor/pdf.js` | PDF com cláusula crítica em destaque (CDC 54 §4º) e hash no rodapé |

⚠️ O texto da biblioteca foi redigido a partir da legislação citada em cada
cláusula, mas **não passou por advogado**. Ver `docs/VALIDADE-JURIDICA.md` §6.

## Documentação

| Documento | O que responde |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Que dor resolve, para quem e o que fica de fora |
| [docs/DIFERENCIAIS.md](docs/DIFERENCIAIS.md) | O que faz ele não ser "mais um DocuSign". **Decisões em aberto** |
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Hierarquia, papéis, serviços internos, API e integrações |
| [docs/DOMINIO.md](docs/DOMINIO.md) | Entidades, motor de modelos, ciclo de vida do contrato |
| [docs/VALIDADE-JURIDICA.md](docs/VALIDADE-JURIDICA.md) | O que dá validade à assinatura, o que guardamos, o que não fazemos |
