# Calendário

O **Calendário** mostra, dia a dia, o dinheiro que entra e sai no mês: lançamentos, parcelas,
boletos com vencimento e vencimento das faturas de cartão. Ele é somente leitura para os eventos
existentes: não cria, edita nem move lançamentos. As regras ficam no domínio
(`packages/domain/src/calendar.ts`).

## Endpoint

`GET /calendar`

| Parâmetro | Valores | Padrão | Observação |
|---|---|---|---|
| `period` | `YYYY-MM` | mês atual (horário de Brasília) | mês exibido |

Período inválido retorna `400`. Sem sessão, retorna `401`. A resposta traz `period` e `days`: uma
grade de 42 dias (6 semanas) começando na segunda-feira. Cada dia tem `date`, `inMonth`, `isToday`,
`totals` (`income` e `expense`, em decimal) e `events`.

## Eventos

| Tipo (`kind`) | Data do evento | Conteúdo |
|---|---|---|
| `transaction` | data da compra | lançamento não parcelado, receita ou despesa |
| `installment` | ver **Parcelas** | parcela com `currentInstallment` e `installmentCount` |
| `boleto` | vencimento (`dueDate`) | boleto a pagar; `isOverdue` quando pendente e vencido |
| `invoice` | vencimento da fatura do cartão | total da fatura do cartão no mês, com `state` |

Ordem dentro do dia: lançamentos e parcelas, depois boletos, depois faturas. Dentro de cada grupo, a
ordem é pelo nome (pt-BR). Os totais do dia somam lançamentos, parcelas e boletos; faturas ficam
fora.

## Regras de posicionamento

- **Lançamentos** entram na data da compra. Transferências ficam de fora.
- **Boletos** entram no vencimento, mesmo quando a compra foi em outro mês. Boletos que não têm
  vencimento não aparecem.
- **Recorrências** aparecem na data da ocorrência do mês, expandidas pela regra de recorrência
  consultada (sem materializar ocorrências futuras). Ocorrências pausadas ou puladas não aparecem.
  Ocorrências recorrentes ainda não baixadas não têm `transactionId`.
- **Faturas de cartão** entram no vencimento ajustado da fatura do mês, pelas regras de vencimento
  da V2 (ver `docs/due-date-rules.md`). Só aparecem quando o total do mês é maior que zero.
- Só eventos cuja data cai no mês consultado são retornados. Datas de dias vizinhos visíveis na grade
  não aparecem; cada evento pertence ao mês selecionado.
- Eventos com o mesmo id são contados uma vez.

## Valor próprio

Em lançamento dividido, o calendário mostra só a parte do usuário administrador (pessoa padrão da
conta). Lançamento sem parte própria é omitido. Partes de outras pessoas nunca aparecem. Valores
são calculados em centavos inteiros no domínio.

Fatura de cartão é a exceção: mostra o total da fatura do mês, com todas as pessoas, como a página
do cartão mostra.

## Parcelas

- **Cartão de crédito:** a compra parcelada vira um único evento `installment`, na data da primeira
  parcela rastreada, e só nesse mês. As parcelas seguintes ficam cobertas pelo evento da fatura.
  O valor mostrado é o da parcela.
- **Outras parcelas sem boleto:** cada parcela vira um evento na sua própria data, com `k/N` e o
  valor da parcela.
- **Boleto parcelado:** cada parcela vira um evento `boleto` no seu vencimento.

## Fatura do cartão

- **Estado:** `paid` (Pago em <data do último pagamento>), `overdue` (Atrasada) ou `pending` para
  os demais estados (Pendente).
- **Exclusões:** cartão sem gasto na fatura do mês não gera evento.

## Exclusões

- Transferências entre contas.
- Lançamentos sem parte do usuário administrador (divididos com outra pessoa, sem alocação própria).
- Eventos com data fora do mês consultado.
- Faturas com total igual ou menor que zero.
- Parcela de cartão sem número da parcela atual.

## Acesso

Todas as consultas são filtradas pelo `userId` da sessão. Lançamentos e faturas de outros usuários
nunca entram na resposta.

## Testes

- Regras de posicionamento, parcelas, boletos, faturas e grade: `packages/domain/src/calendar.test.ts`.
- Apresentação e agrupamento na página: `apps/web/src/features/calendar/calendar.presentation.test.ts`.
- Endpoint e isolamento por usuário: `apps/api/src/calendar.integration.test.ts`
  (`pnpm test:calendar:integration`).
