# Raízes da ICP-Brasil

Certificados públicos das Autoridades Certificadoras Raiz Brasileiras, emitidos
pelo ITI. O verificador de assinatura ICP-Brasil (`src/plugaveis/icp.js`) só
aceita uma cadeia que termine numa destas raízes.

| Arquivo | Raiz | Válida até | SHA-256 |
|---|---|---|---|
| ICP-Brasilv5.crt | Autoridade Certificadora Raiz Brasileira v5 | 02/03/2029 | `CA:A5:3F:C6:09:1C:69:51:88:7C:97:6E:37:8F:6E:F8:9A:A6:37:7C:55:D9:7B:64:75:42:2B:71:ED:7E:9B:17` |
| ICP-Brasilv10.crt | Autoridade Certificadora Raiz Brasileira v10 | 01/07/2032 | `6E:0B:FF:06:9A:26:99:4C:15:DE:2C:48:88:CC:54:AF:84:88:2E:54:95:B7:FB:F6:6B:E9:CC:FF:EC:74:89:F6` |
| ICP-Brasilv11.crt | Autoridade Certificadora Raiz Brasileira v11 | 01/07/2032 | `14:06:71:00:58:18:0F:A4:08:1A:AB:3F:24:6F:17:02:42:9C:55:2A:11:FA:31:43:B8:4C:88:CB:3A:B8:E5:E7` |
| ICP-Brasilv12.crt | Autoridade Certificadora Raiz Brasileira v12 | 22/10/2037 | `D8:47:8E:37:CE:19:C6:90:CF:65:73:81:E6:8F:E6:00:E4:E1:A0:42:53:68:30:F0:68:47:E0:3E:55:4C:4B:01` |

**Procedência:** baixados em 16/10/2026 de
`http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasil<versão>.crt`.

⚠️ **Antes de produção, confira as impressões digitais acima com as publicadas
pelo ITI.** O repositório do ITI serve por `http`, sem TLS, então um
intermediário poderia ter trocado o arquivo no download. Quem confia numa raiz
falsa aceita certificado falso.

Raiz nova (o ITI emite de tempos em tempos): baixe, confira a impressão digital
e acrescente o arquivo aqui. Nada no código muda.
