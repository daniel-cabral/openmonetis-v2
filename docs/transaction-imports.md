# Importação de lançamentos

A importação lê um arquivo de extrato ou fatura, mostra os lançamentos para revisão e grava só o
que o usuário selecionou. A API é a única fonte de verdade: o cliente apenas apresenta o resultado
de `detect` e `preview`.

## Formatos

| Formato | Origem | Destino |
| --- | --- | --- |
| `.ofx`, `.qfx` | Extrato bancário padrão OFX | Conta ou cartão |
| `.xlsx`, `.xls` | Planilha moderna (`.xls` com conteúdo xlsx também é lido) | Conta ou cartão |
| `.csv` | Perfis de banco (ver registro abaixo) | Conta ou cartão, conforme o perfil |

`.xls` binário (Excel 97-2003) é recusado com `IMPORT_XLS_BINARY_NOT_SUPPORTED`. O limite do
arquivo é de 5 MB e de 1000 linhas.

## Fluxo em duas etapas para CSV

1. `POST /transactions/imports/detect` recebe `{ fileName, contentBase64 }` e responde os perfis
   disponíveis, o perfil sugerido (`detectedProfileId`, ou `null`) e a identificação da conta
   quando existir no arquivo. Não grava nada.
2. `POST /transactions/imports/preview` exige `profileId`, `destinationType` e `destinationId`.
   O destino precisa pertencer ao usuário e corresponder ao tipo do perfil.

Depois do preview, `POST /transactions/imports` grava as linhas selecionadas em um lote
(`batchId`), que pode ser desfeito com `DELETE /transactions/imports/{batchId}`.

## Registro de perfis

Perfis ficam em `packages/domain/src/import-profiles.ts`. Cada perfil declara `id`, `label` (PT-BR),
`kind` (`statement` ou `invoice`), `destinationType`, `headerSignature` (fragmentos que devem estar
em uma mesma linha do cabeçalho), `readAccountIdentification` (opcional) e `parse`.

Para adicionar um banco:

1. Crie o parser puro em `packages/domain/src/import-<banco>.ts`, retornando `ImportedStatement`
   com valores em centavos e `invalidLines` para linhas ilegíveis.
2. Registre o perfil em `importProfiles`, com uma assinatura que não case o cabeçalho do outro perfil.
3. Adicione o `id` aos enums de `TransactionImportDetectionSchema` e `PreviewTransactionImportInputSchema`
   em `packages/validators/src/transactions.ts`.
4. Teste o parser com o fixture real do banco e a detecção com um arquivo de outro perfil.

A detecção é só uma sugestão: nunca lança erro e sempre lista todos os perfis.

## Identidade das linhas

Linhas de CSV não têm identificador do emissor. A identidade é o SHA-256 do payload gerado por
`buildImportRowIdentityPayloads` (`packages/domain/src/import-row-identity.ts`), que inclui a
origem, o destino, a identificação da conta, as datas, a descrição normalizada, o valor com sinal e
um índice de ocorrência entre linhas idênticas, na ordem do arquivo. Reprocessar o mesmo arquivo
gera as mesmas identidades. O mesmo arquivo em outra conta gera identidades diferentes.

`sourceFingerprint` é o SHA-256 de `csv:<profileId>:<identificação da conta ou vazio>`. O índice
único do lançamento (usuário, fingerprint, identidade) impede duplicatas, sem tabela nova.

## Chave de memória de categoria

`getImportedDescriptionKey` (`packages/domain/src/transactions.ts`, FR-015) gera a chave por
comerciante: minúsculas, sem o marcador de país (`BRA`/`BR`) e a praça antes dele, mantendo o lado
mais longo de `ADQUIRENTE*LOJISTA`, sem código numérico inicial e sem número de loja. A chave antiga,
`normalizeImportedDescriptionKey`, só é usada para busca (FR-016). O preview procura a chave por
comerciante primeiro; a gravação usa sempre a chave por comerciante.

## Linhas não importáveis

Para perfis de fatura, linhas `credit` (crédito na fatura) e `invoice-payment` (pagamento de fatura
anterior) são exibidas como informativas, com `importable: false`, e não são selecionáveis. Enviar
uma dessas linhas em `POST /transactions/imports` retorna `400 IMPORT_ROW_NOT_IMPORTABLE` antes de
qualquer leitura ou escrita.

## Códigos de erro

| Código | Quando |
| --- | --- |
| `IMPORT_FILE_TOO_LARGE` | Arquivo acima de 5 MB ou vazio |
| `IMPORT_FORMAT_NOT_SUPPORTED` | Extensão não aceita, ou `detect` com arquivo que não é `.csv` |
| `IMPORT_FILE_INVALID` | Conteúdo ilegível ou sem cabeçalho/linhas válidas |
| `IMPORT_TOO_MANY_ROWS` | Mais de 1000 lançamentos |
| `IMPORT_PROFILE_REQUIRED` | CSV sem `profileId`, `destinationType` ou `destinationId` |
| `IMPORT_PROFILE_NOT_FOUND` | `profileId` desconhecido |
| `IMPORT_DESTINATION_MISMATCH` | Tipo do destino diferente do tipo do perfil |
| `ACCOUNT_NOT_FOUND` / `CARD_NOT_FOUND` | Destino inexistente, de outro usuário, arquivado ou inativo |
| `IMPORT_XLS_BINARY_NOT_SUPPORTED` | `.xls` no formato Excel 97-2003 |
| `IMPORT_ROW_NOT_IMPORTABLE` | Linha `credit` ou `invoice-payment` enviada para importação |

Linhas com data ou valor inválido não abortam o arquivo: vão para `invalidLines` com o número da
linha no arquivo e são ignoradas na revisão.
