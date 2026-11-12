# Conciliação de extrato e fatura

A conciliação compara um arquivo de extrato ou fatura com os lançamentos já existentes no app e
mostra o resultado para revisão. Nada é gravado antes de o usuário aplicar. A API é a única fonte
de verdade: o cliente apenas apresenta o resultado de `detect` e `preview`.

## Fluxo

1. `POST /reconciliations/detect` lê o arquivo e sugere a conta do arquivo, quando ela for identificável. Não grava nada.
2. `POST /reconciliations/preview` classifica cada linha do arquivo contra os lançamentos do destino
   e devolve os buckets, as sugestões e o `classificationDigest`. Não grava nada.
3. `POST /reconciliations` aplica o lote. A API refaz a classificação e compara o
   `classificationDigest` enviado pelo cliente. Se mudou, responde `RECONCILIATION_STALE`.
4. `DELETE /reconciliations/{batchId}` desfaz o lote inteiro.

O destino é uma conta (`account`, com intervalo de datas do arquivo) ou um cartão (`card`, que exige
`invoicePeriod`, senão `RECONCILIATION_INVOICE_PERIOD_REQUIRED`).

## Regras de casamento

As regras rodam nesta ordem. Para cada linha, a primeira regra que encontra candidatos decide:

| Regra | Critério | Escopo |
| --- | --- | --- |
| `identity` | Identificador externo já gravado no lançamento | Todos |
| `installment` | Parcela N/M de série com o mesmo total e o mesmo valor | Linhas com parcela |
| `exact` | Mesmo valor com sinal, com data de compra ou de lançamento a até 2 dias | Todos |
| `cents` | Valor com tolerância de 5 centavos, na janela de 2 dias | Só linhas com parcela |
| `name-period` | Nome aprendido para o comerciante, mesmo mês e mesmo sinal | Só conta |

- Um candidato livre casa e consome o lançamento.
- Dois ou mais candidatos deixam a linha como `ambiguous`. Regras mais fracas não a resolvem.
- As passadas se repetem até estabilizar, porque um casamento libera candidatos que outra linha disputava.
- Linhas `credit` e `invoice-payment` são informativas e nunca casam com lançamento do app.

Constantes em `packages/domain/src/reconciliations.ts`: `RECONCILIATION_DATE_WINDOW_DAYS = 2` e
`RECONCILIATION_CENTS_TOLERANCE = 5`.

## Buckets

Cada linha cai em exatamente um bucket, nesta ordem: `ignored`, `informational`, depois o resultado
do casamento.

| Bucket | Significado |
| --- | --- |
| `needs-decision` | Casou, mas tem suspeita: precisa de decisão do usuário |
| `matched` | Casou sem suspeita |
| `bank-only` | Linha do arquivo sem lançamento correspondente |
| `ambiguous` | Mais de um candidato, o usuário escolhe |
| `ignored` | Linha marcada como ignorada em um lote anterior |
| `informational` | Crédito ou pagamento de fatura, não importável |

Lançamentos do app sem linha no arquivo formam a lista `appOnlyKeys`. No cartão, o escopo é o período
da fatura. Na conta, é o intervalo de datas do arquivo.

## Suspeitas

- `before-file-start`: lançamento da conta anterior ao início do arquivo. Só vale para conta.
- `amount-divergence`: valor diferente só na regra `identity`. As outras regras casam valores
  diferentes de propósito (conta recorrente estimada).

Qualquer suspeita move a linha para `needs-decision`.

## Autoridade do valor

O valor do arquivo prevalece. Ao casar, o lançamento recebe o valor da linha, exceto quando ele não
pode mudar. Nesses casos o valor do app é mantido e o motivo é registrado:

| Motivo | Quando |
| --- | --- |
| `splits` | Lançamento com divisões |
| `transfer` | Transferência |
| `generated` | Lançamento gerado automaticamente |
| `paid-invoice` | Lançamento em fatura já paga |
| `card-recurring` | Recorrência de cartão |

## Efeito no casamento

- Conta: lançamento pendente casado vira pago, com data `postedDate` ou, na falta dela, `purchaseDate`.
  Transferências são resolvidas pelo repositório.
- Cartão: o casamento apenas marca o lançamento com o identificador externo e, se necessário, alinha o valor.
- Casamentos por regras que não são `identity` gravam o identificador externo no lançamento, o que
  faz a regra `identity` funcionar nas próximas importações. Casamentos `identity` já o têm.

## Ações por linha

Cada decisão enviada tem uma `action`:

- `keep`: mantém o casamento automático ou a escolha de candidato ambíguo.
- `link`: vincula a linha a um lançamento existente. Pode trocar o nome.
- `create`: cria um lançamento novo. Exige nome não vazio (`RECONCILIATION_EMPTY_NAME`).
- `ignore`: ignora a linha. Exige `ignoreReason` de 1 a 160 caracteres.
- `skip`: não faz nada nesta linha.

Se o plano não tiver nenhuma escrita, a API responde `RECONCILIATION_NOTHING_TO_APPLY`.

## Memória de nome e categoria

- Ao vincular ou criar, o nome da linha é gravado para a chave do comerciante
  (`getImportedDescriptionKey`). Na conta, esse nome alimenta a regra `name-period` e o nome sugerido
  nas próximas linhas.
- A categoria do lançamento casado ou criado é gravada para a mesma chave e sugerida nas próximas
  prévias.
- Ignorar uma linha grava o motivo por `(usuário, fingerprint do arquivo, identificador externo)`
  na tabela `reconciliation_ignores`. A linha vem como `ignored` nas próximas prévias do mesmo arquivo.

## Diário de desfazer

Cada lote grava em `reconciliation_batches.undo` (JSON) o que foi feito: lançamentos liberados,
criados, marcados com identificador externo, lançamentos pagos pela conciliação e alterações de
valor, com o valor anterior. `DELETE /reconciliations/{batchId}` usa esse diário para reverter tudo
na mesma transação. Lote inexistente ou de outro usuário responde `RECONCILIATION_BATCH_NOT_FOUND`.

## Códigos de erro

| Código | Quando |
| --- | --- |
| `RECONCILIATION_INVOICE_PERIOD_REQUIRED` | Destino cartão sem `invoicePeriod` |
| `RECONCILIATION_STALE` | `classificationDigest` diferente do que a API calcula agora |
| `RECONCILIATION_NOTHING_TO_APPLY` | Nenhuma escrita no plano |
| `RECONCILIATION_EMPTY_NAME` | Linha criada sem nome |
| `RECONCILIATION_BATCH_NOT_FOUND` | Lote não encontrado para desfazer |
| `INVOICE_ALREADY_PAID` | Lançamento seria criado em fatura já paga |

Linhas com data ou valor inválido vão para `invalidLines` e não entram na revisão, como na
importação (ver `docs/transaction-imports.md`).
