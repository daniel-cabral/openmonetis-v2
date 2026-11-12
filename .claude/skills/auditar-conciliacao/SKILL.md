---
name: auditar-conciliacao
description: Use quando o saldo do openmonetis não bater com o do banco, ao investigar lançamento duplicado, fantasma ou faltante, ao refazer a conciliação de um extrato ou fatura do C6, ou ao decidir se um número da tela está errado ou apenas projetado.
---

# Auditar conciliação (openmonetis V2 + C6)

## Overview

Achar por que o saldo do app diverge do banco. O princípio: **o extrato do banco é a autoridade, e a
divergência se localiza por aritmética antes de se explicar por lançamento.** Comparar totais dos
dois lados isola o mês; só então vale olhar linha a linha, e aí sempre por **nome e valor juntos**.

## A regra que não se negocia

**Casar por nome E valor. Nunca concluir nada por coincidência de valor.**

Num mês real havia três lançamentos de R$ 2.000,00 e o extrato tinha dois débitos de R$ 2.000,00 no
mesmo dia, um para uma pessoa e outro para uma instituição de pagamento. Um diagnóstico feito só
pelo valor apontou o lançamento errado como duplicata; seguir com ele teria apagado uma despesa
real. O valor sozinho não distingue nada num extrato com recorrentes.

Corolário: uma coincidência entre o valor da divergência e algum lançamento **não é evidência de
causa**. Divergência de R$ 2.000 com um lançamento de R$ 2.000 à vista é exatamente onde o erro
acontece.

## Método, na ordem

### 1. Localizar o mês pela aritmética

Nunca comece pelos lançamentos. Compare saldos de fim de mês:

```
Extrato: saldo da última linha de cada dia contábil do mês (coluna Saldo do Dia(R$))
App:     Contas → conta → extrato, saldo do período
         Revisão da conciliação: "Saldo do app após aplicar" x "Saldo final do extrato"
```

A divergência aparece num mês e se propaga para os seguintes. Encontre onde ela **nasce**, o mês em
que o delta muda de tamanho. Corrigir um mês antigo conserta todos os posteriores de uma vez.

Atenção ao efeito de erros que se compensam: um saldo inicial alto somado a despesas a mais aparece
como uma divergência pequena. **Compare entradas e saídas separadamente**, nunca só o líquido.

### 2. Confrontar totais do mês

```
App:   export do mês (passo 3), somar Valor (R$) positivo (entradas) e negativo (saídas)
Banco: somar Entrada(R$) e Saída(R$) das linhas com Data Contábil do mês
```

O `confronto.py` já imprime esses totais dos dois lados. Se as entradas batem e as saídas não, o
problema é só de despesa. Confira se o arquivo cobre o mês inteiro: um extrato que começa dia 05 não
fecha o mês.

### 3. Só então, linha a linha

Exporte do app: **Transações**, filtre a conta e o período, **Exportar** → CSV
(`GET /transactions/export?format=csv`). Depois cruze com o extrato:

```bash
python .claude/skills/auditar-conciliacao/confronto.py <export.csv> <extrato-c6.csv> <MM/AAAA>
```

O script mostra, de cada lado, as saídas sem par no outro lado, com data, nome e situação. Ele casa
por valor só para apontar candidatos; a decisão é sua, por nome **e** valor.

Fatura do cartão não passa pelo `confronto.py`: ela é conferida pelo total (seção "Fechamento
aritmético" abaixo).

## Formatos dos arquivos

| Arquivo | Separador | Decimal | Cabeçalho (colunas relevantes) |
|---|---|---|---|
| Extrato C6 | `,` | ponto (`550.72`) | `Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)` |
| Fatura C6 | `;` | ponto (`-12164.10`) | `Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)` |
| Export do app | `;`, UTF-8 com BOM, CRLF | vírgula, sem separador de milhar (`-1234,56`) | `Data;Competência;Descrição;Tipo;Categoria;Pessoa;Conta;Cartão;Forma de pagamento;Condição;Parcela;Conta de origem;Conta de destino;Vencimento;Situação;Valor (R$);Data da baixa;Observações` |

- Extrato: as primeiras linhas são do banco (agência, período, data de geração). O cabeçalho é
  localizado pelo texto, não pela posição (`parseC6StatementCsv` em `packages/domain/src/import-c6.ts`).
- Fatura: compra é valor positivo; crédito e pagamento são negativos (`parseC6InvoiceCsv`).
- Export: valor com sinal (despesa negativa, receita positiva). `Situação` vale `Pago`, `Recebido`,
  `Confirmado`, `Em aberto` ou `Pela fatura`. As datas saem `dd/mm/yyyy`.
- **Datas do export não são a Data Contábil do banco.** `Data` é a data da compra; `Data da baixa` é a
  data de pagamento. O export não traz Data Contábil. Para conta, o `confronto.py` usa `Data da baixa`
  quando preenchida; diferença de um ou dois dias entre as duas datas é esperada.
- Célula de texto que começa com `=`, `+`, `-` ou `@` sai com apóstrofo na frente (`'-linha`). O
  `confronto.py` remove esse apóstrofo; ao citar um nome do export, tire-o também.

## Como o C6 monta a fatura

O total da fatura **não** é a soma das compras:

```
Total = compras − créditos desta fatura
```

A classificação das linhas negativas é por descrição (`classifyC6InvoiceLine`):

- Descrição com `pag fatura` (ex.: `Pag Fatura Boleto`): quitação da fatura **anterior**. Sai da
  conta corrente e **não entra** no total. Tipo `invoice-payment`.
- Qualquer outro negativo (`Estorno ...`, `Inclusao de Pagamento`, adiantamentos): crédito **desta**
  fatura. **Entra** no abatimento. Tipo `credit`.

Conferido num caso de teste da V2: compras R$ 19.484,72 − estorno R$ 98,00 − inclusões R$ 5.222,62 e
R$ 2.000,00 = **R$ 12.164,10**, igual ao boleto pago.

## Fechamento aritmético (V2)

A revisão confere o arquivo consigo mesmo. Não compara com o app; a comparação com o app é o saldo previsto.

- **Extrato** (`closure.kind = "statement"`): por dia contábil, movimento (saldo do dia menos o saldo
  do dia anterior) contra a soma das linhas do dia. Dia com diferença é divergência. O primeiro dia
  e dia sem saldo são **não verificáveis** e aparecem à parte. O saldo final é o último saldo do
  último dia contábil.
- **Fatura** (`closure.kind = "invoice"`): líquido = compras − créditos (sem quitação), comparado com
  o total informado no campo "Total da fatura (R$)". Sem total informado, não há comparação.

Regra: `checkStatementClosure` e `checkInvoiceClosure` em `packages/domain/src/reconciliations-closure.ts`.

## Saldo previsto (V2)

A barra "Saldo do app após aplicar" da revisão mostra o saldo da conta até o último dia do arquivo,
mais o efeito de cada decisão, e compara com o saldo final do extrato. Ela **nunca bloqueia Aplicar**.

- Só lançamentos da pessoa admin entram no saldo previsto. Lançamento de outra pessoa não tem status
  e não altera o número.
- Status de cada lançamento: `in-balance` (pago, até o corte: já está no saldo), `unsettled` (não
  pago), `after-end` (pago depois do último dia do arquivo).
- A lista **"pagos depois do fim do arquivo"** mostra os `after-end` que nenhuma decisão vinculou. É o
  primeiro lugar a olhar quando o app tem pagamento que o extrato ainda não mostra.

Regra: `projectAccountBalance` e `toBalanceStatus` em `packages/domain/src/reconciliations-projection.ts`.

## Armadilhas do app

| Sintoma | Causa | O que fazer |
|---|---|---|
| Saldo do card não bate com o banco | O card mostra o saldo do **período**, não o do dia do arquivo. O corte por data usa a data de lançamento (`postingDate`; sem ela, o fim do período) | Na revisão, ler "Saldo do app após aplicar" e a lista "pagos depois do fim do arquivo" |
| Saída "Em aberto" no app sem par no banco | Lançamento ainda não pago | Esperado. Não é divergência |
| Lançamento de quitação de fatura não apaga pela linha | Origem `invoicePayment` não é apagável (`canDeleteTransactionOrigin`) | Cartões → fatura → período correto → "Desfazer pagamento" (`DELETE /invoices/{cardId}/{period}/payments/{paymentId}`) |
| Ajuste de saldo aparece como lançamento | Origem `accountBalanceAdjustment`, criada por "Ajustar saldo" (`adjust-account-balance-dialog.tsx`) | Trate como sintoma: ele fecha o número e apaga a pista. Remova só depois de achar a causa real |
| Crédito da fatura errado ou faltando | Origem `invoiceCredit`: fica fora de receitas, despesas e orçamentos | Pode editar e excluir. Mudar tipo, forma de pagamento ou cartão é recusado (`INVOICE_CREDIT_SHAPE_LOCKED`). Desfazer o lote remove todos |
| Recorrente cai sempre em "só no banco" | Débito real fora da janela de casamento automático (`RECONCILIATION_DATE_WINDOW_DAYS`, ±2 dias) | Na linha, "Vincular a outro lançamento" |
| Casamento em "Precisa da sua decisão" | Valor do app diferente do arquivo | Conferir o débito real. "Manter" alinha o valor ao do arquivo; "Criar lançamento" ou "Vincular a outro lançamento" são as alternativas |
| Linha "só no arquivo" não foi criada | A decisão padrão dessa linha é "Pular", que não grava nada | Marcar "Criar lançamento" e aplicar |
| Desfazer depois de aplicar | O toast "Desfazer" chama `DELETE /reconciliations/{batchId}`, que reverte o lote inteiro na mesma transação (diário em `reconciliation_batches.undo`) | Só o toast da sessão oferece o desfazer. Depois que ele some, o lote só se reverte pela API, com o `batchId` |
| Pago mas sem vínculo com o extrato | Lançamento pago, sem identificador de importação, com data igual ou posterior à primeira linha conciliada da conta | Ícone de link partido no extrato da conta (tooltip "Pago, mas não conciliado com o extrato"). Importe e concilie o arquivo que cobre a data |
| Upload do CSV não reage | `file_upload` programático não dispara o `onChange` do React | Pedir ao usuário para arrastar o arquivo; não insistir |

## Lições

**Erros que se compensam escondem o tamanho do problema.** Uma divergência pequena pode ser a
diferença entre dois erros grandes. Sempre decomponha entradas e saídas.

**Ajuste manual de saldo mascara a causa.** Lançamentos de origem `accountBalanceAdjustment` fecham o
número e apagam a pista. Trate-os como sintoma, não como dado.

**Antes de recomendar exclusão, procure a contrapartida.** Um lançamento órfão no app pode ser o par
legítimo de uma linha que casou errado com outro lançamento. Verifique quem casou com quem.

**Pagamento adiantado desloca a data.** Quem paga em agosto o boleto que vence em setembro tem o
débito num mês e o lançamento em outro. Por isso o corte do saldo usa a data de lançamento, e a
projeção usa a data da baixa. Alargar janela não resolve; alinhe a data do lançamento ao mês do débito.

**Recorrente marcado como pago antes da hora é a causa mais comum de saldo que não bate.** Conte
quantos débitos daquele credor saíram de fato no extrato e quantos lançamentos estão como pagos. Se
houver mais pagos que débitos, a diferença é essa.

**Medir antes de calibrar.** Ao mexer na janela de data do matcher, meça com dados reais. A tabela de
medições está em `docs/reconciliations.md` e no comentário de `RECONCILIATION_DATE_WINDOW_DAYS`.

## Onde ficam as coisas

- Parsers C6 (extrato e fatura): `packages/domain/src/import-c6.ts`
- Buckets, casamento e alinhamento de valor: `packages/domain/src/reconciliations.ts`
- Plano de escrita e origem das criações: `packages/domain/src/reconciliations-plan.ts`
- Fechamento aritmético: `packages/domain/src/reconciliations-closure.ts`
- Saldo previsto: `packages/domain/src/reconciliations-projection.ts`
- Pipeline de preview e aplicação: `apps/api/src/services/reconciliations.service.ts`
- Persistência da conciliação: `apps/api/src/repositories/reconciliations.repository.ts`
- Saldo da conta e ajuste: `apps/api/src/services/accounts.service.ts`
- Origens de lançamento: `packages/domain/src/transactions.ts` (`transactionOrigins`)
- Tela da conciliação: `apps/web/src/routes/transactions_.reconciliation.tsx` e
  `apps/web/src/features/reconciliations/components/`
- Export: `apps/api/src/utils/transactions-export.ts` e
  `apps/web/src/features/transactions/components/transactions-export-menu.tsx`
- Faturas e quitação: `apps/api/src/routes/invoices.ts` e
  `apps/web/src/features/cards/components/card-invoices-page.tsx`
- Regras, rotas e códigos de erro: `docs/reconciliations.md`
- Decisões de cada fase: `specs/002-reconciliation-core/` e `specs/003-reconciliation-closure/`

## Verificação do projeto

```bash
pnpm typecheck
pnpm exec tsx --test <arquivo.test.ts>        # só os arquivos tocados
pnpm test:reconciliations:integration         # integração, sempre em bash, uma por vez
```

`pnpm lint` (Biome) ignora `.claude/`: este diretório não passa por ele. Teste de integração em
`apps/api/src/reconciliations.integration.test.ts`.
