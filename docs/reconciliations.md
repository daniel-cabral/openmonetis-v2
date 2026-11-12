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
| `informational` | Só o pagamento da fatura anterior, não importável |

Créditos da fatura (estornos, inclusões de pagamento posteriores ao vencimento anterior) casam como
qualquer linha e podem ser criados. Ver "Créditos da fatura".

Lançamentos do app sem linha no arquivo formam a lista `appOnlyKeys`. No cartão, o escopo é o período
da fatura. Na conta, é o intervalo de datas do arquivo.

## Fechamento aritmético

A prévia traz `closure`, calculado só com os dados do arquivo. Nada é enviado à API para isso.

- **Extrato da conta:** as linhas são agrupadas por data contábil. A soma de cada dia é comparada
  com a variação do saldo do dia (saldo do dia menos saldo do dia anterior). Dia sem saldo, ou o
  primeiro dia do arquivo, é não verificável e não bloqueia o fechamento. `closes` vale quando nenhum
  dia verificável diverge. `finalBalance` é o saldo do último dia do arquivo, sem fallback.
- **Fatura do cartão:** o total líquido é a soma das linhas sem o pagamento da fatura anterior, com
  o sinal invertido (compras somam, créditos subtraem). A prévia só fecha quando o total informado
  na tela bate com esse valor. Sem total informado, não há comparação.

## Saldo previsto

A barra de aplicação mostra o saldo da conta, ou o total da fatura, depois de aplicar as decisões.
Não bloqueia o botão Aplicar.

- **Conta:** a base é o saldo da conta até o último dia do arquivo. Cada decisão altera essa base:
  um lançamento mantido ou vinculado ocupa o valor do arquivo (quando alinhável) ou o valor do app;
  um lançamento criado para o administrador soma o valor da linha. Lançamentos de outras pessoas não
  entram no saldo. O saldo previsto é comparado com o saldo final do extrato.
- **Pagos depois do fim do arquivo:** lançamentos do administrador já pagos, com data posterior ao
  último dia do arquivo, que nenhuma decisão vinculou. Aparecem na lista "ver" da barra.
- **Cartão:** o total previsto é a soma das compras da fatura com os efeitos das decisões. Só é
  comparado quando o total informado existe.

## Créditos da fatura

Crédito da fatura é um lançamento de receita com origem `invoiceCredit` (migration `0034`), criado
pela conciliação de um crédito do cartão:

- Fica fora de receitas, despesas, orçamentos, relatórios de distribuição, tags e pessoas. Reduz a
  fatura uma única vez.
- Não é pagamento de fatura: o valor pago da fatura não inclui créditos.
- Sobrevive ao desfazer um pagamento da fatura. Sai com `DELETE /reconciliations/{batchId}`.
- Pode ser editado, mantendo tipo receita, forma de pagamento `credit_card` e cartão. Tentar mudar
  esses campos responde `INVOICE_CREDIT_SHAPE_LOCKED`.
- Uma segunda leitura do mesmo arquivo casa esses créditos por identidade, sem duplicar.

## Pago e não conciliado

No extrato da conta, um lançamento pago (com data a partir do primeiro lançamento conciliado da conta)
sem identidade de importação recebe o ícone de vínculo quebrado, com o texto
"Pago, mas não conciliado com o extrato". A flag `isPaidUnreconciled` vem em
`GET /transactions?view=accountStatement`. Lançamentos de cartão nunca recebem a flag.

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
| `INVOICE_CREDIT_SHAPE_LOCKED` | Edição de crédito da fatura muda tipo, forma de pagamento ou cartão |

Linhas com data ou valor inválido vão para `invalidLines` e não entram na revisão, como na
importação (ver `docs/transaction-imports.md`).
