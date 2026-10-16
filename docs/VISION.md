# Visão

## A dor

Fazer um contrato hoje é: abrir o último `.docx` parecido, trocar nomes à mão,
torcer para não sobrar o CPF do cliente anterior, mandar por e-mail, imprimir,
assinar, escanear e perder numa pasta. Quem faz isso 300 vezes por ano (RH,
imobiliária, escritório, clínica) sente três problemas:

1. **Redigir** — o texto bom está preso na cabeça (ou no Word) de uma pessoa. Cada
   variação (PF ou PJ, com ou sem fiador, prazo determinado ou não) vira um arquivo
   novo, e corrigir uma cláusula significa corrigir em N arquivos.
2. **Preencher** — os dados já existem em algum sistema (folha, CRM, ERP), mas são
   redigitados. Erro de digitação em contrato é passivo.
3. **Assinar e provar** — conseguir a assinatura é lento. Quando ela é eletrônica,
   pouca gente sabe se aquilo **vale em juízo**.

O ExameQR já resolveu uma versão pequena disso (um tipo de contrato, um tipo de
parte). Este produto é a versão geral.

## Para quem

| Público | O que ele quer daqui |
|---|---|
| **Empresas com RH** | Admissão, aditivo e distrato em lote, gerados a partir da base de funcionários |
| **Escritórios de advocacia** | Biblioteca própria de cláusulas, modelos para clientes, controle de versões |
| **Imobiliárias / prestadores** | Locação, prestação de serviços, PF ou PJ, assinatura pelo celular |
| **Cartórios** | Minutas padronizadas e gestão documental. **Não** é ato notarial (ver [VALIDADE-JURIDICA.md](VALIDADE-JURIDICA.md) §5) |
| **Outros SaaS** (como o ExameQR) | Contratos via API, sem construir o módulo de novo |

## A promessa, em uma frase

> **Você escreve o contrato uma vez. O sistema preenche com os dados certos, quem
> assina entende o que assinou, e qualquer pessoa consegue verificar que ele é
> autêntico.**

As três partes dessa frase correspondem aos três problemas acima. O "entende o
que assinou" e o "qualquer pessoa verifica" são o diferencial (ver
[DIFERENCIAIS.md](DIFERENCIAIS.md)).

## Princípios

- **Simples por padrão.** Quem só quer um contrato de prestação de serviços
  escolhe o modelo, preenche e envia, sem passar por configuração. A potência
  (regras, fontes de dados, API) fica disponível, mas ninguém é obrigado a usar.
- **Contrato assinado é imutável.** Depois de criado, o texto não muda, e uma
  versão nova do modelo só afeta os próximos contratos (herdado do ExameQR).
- **Nada vai para assinatura com lacuna.** Um placeholder sem valor bloqueia o
  envio e diz onde resolver (`montarConteudo` → `faltando`, herdado).
- **A prova é do cliente.** Ele pode baixar o PDF e o dossiê de evidências
  completo a qualquer momento. Sair do sistema não destrói nenhuma prova.
- **Independente de provedor.** A assinatura é nossa. Provedores externos (ZapSign,
  ICP-Brasil) são plugáveis, e nenhum é dependência.

## O que NÃO é (por enquanto)

- Não é ferramenta de **redação por IA de contrato do zero**. IA pode entrar como
  assistente (ver DIFERENCIAIS), mas quem responde pelo texto é um humano.
- Não é **CLM corporativo** (negociação com redline entre empresas, workflow de
  aprovação de 12 níveis). Talvez venha depois, mas não é o foco agora.
- Não **lavra ato notarial** nem substitui escritura pública.
- Não é **ERP/folha**. Ele lê a base de funcionários, mas não é dono dela.
