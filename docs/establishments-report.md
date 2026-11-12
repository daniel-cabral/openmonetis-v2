# Relatório de estabelecimentos

O relatório **Estabelecimentos** mostra onde o usuário mais compra: quantas vezes, quanto gasta e
em quais categorias cada estabelecimento aparece. Ele não cria lançamentos nem altera dados: lê as
despesas e as recorrências já registradas. As regras ficam no domínio (`packages/domain`).

## Regras

- **Janela:** termina no mês escolhido (`period`, padrão: mês atual no horário de Brasília) e cobre
  3, 6 ou 12 meses (`months`, padrão 6), incluindo o mês final.
- **O que conta como compra:** só despesas de origem regular. Ficam de fora transferências,
  receitas, estornos, pagamentos de fatura, ajustes de saldo, ajustes de fatura, liquidações entre
  pessoas, lançamentos em contas marcadas como fora do saldo e lançamentos na categoria de
  pagamento de fatura.
- **Parte própria:** em lançamento dividido, conta só a parte do usuário administrador. Os totais
  são em centavos inteiros no domínio e chegam à API como valores decimais.
- **Recorrências:** cada regra ativa gera uma ocorrência por período dentro da janela. Regras
  pausadas não entram. Ocorrências marcadas como fora do saldo são excluídas, e lançamentos de valor
  zero não contam.
- **Agrupamento:** por nome exato do lançamento. Compras sem categoria entram nos totais, mas não
  nas listas de categorias.
- **Ranking:** por quantidade de compras (maior primeiro), depois pelo total e, por fim, pelo nome
  em ordem pt-BR.
- **Limites:** a lista traz até 50 estabelecimentos; `establishmentCount` conta todos. Cada
  estabelecimento lista até 3 categorias, ordenadas por quantidade. As **categorias principais**
  listam até 10, ordenadas pelo total.
- **Resumo:** `averageAmount` é o total dividido pelo número de compras, arredondado para centavos.
  `mostFrequent` é o primeiro do ranking e `highestTotal` é o de maior total (ou `null` sem
  compras).

## Endpoint

`GET /reports/establishments`

| Parâmetro | Valores | Padrão | Observação |
|---|---|---|---|
| `period` | `YYYY-MM` | mês atual | fim da janela |
| `months` | `3`, `6`, `12` | `6` | ignorado quando `trip` é o id de uma viagem |
| `trip` | `none` ou UUID | ausente | ausente = todos os lançamentos |

Período ou `months` inválidos retornam `400`. A resposta traz `window`, `months`, `tripFilter`,
`summary`, `establishments` e `topCategories`. `tripFilter.mode` é `all`, `none` ou `trip`; em
`trip`, vêm também `tripId` e `tripName`.

## Filtro de viagem

O parâmetro `trip` vale para o relatório de estabelecimentos e para o relatório de
**Tendências por categoria** (`GET /reports/category-trends`):

- `trip=<uuid>`: só os lançamentos vinculados à viagem, inclusive as ocorrências recorrentes
  vinculadas a ela. No relatório de estabelecimentos, a janela passa a ser o período da própria
  viagem, sem o limite de meses.
- `trip=none`: só os lançamentos sem viagem.
- Ausente, id desconhecido ou de outro usuário: sem filtro, sem erro (o `tripFilter` volta a
  `all`).
- `GET /reports/installments` não tem filtro por viagem: o parâmetro `trip` é ignorado e a resposta
  é a mesma.

### Período da viagem

`GET /trips/:tripId/period-range` devolve `{ "startPeriod", "endPeriod" }` com os meses cobertos
pelos lançamentos vinculados, incluindo parcelas e ocorrências recorrentes (datas de fatura
de cartão). O intervalo é limitado a **24 meses** a partir de `startPeriod`. Retorna `null` quando a
viagem não tem lançamentos vinculados, ou quando é desconhecida ou de outro usuário.

Na página de Tendências por categoria, escolher uma viagem move o intervalo para esses meses. O
botão **Limpar filtros** remove também a viagem.

## Testes

- Regras de ranking, janela, elegibilidade e recorrência: `packages/domain/src/establishments-report.test.ts`.
- Filtro de viagem em tendências e intervalo da viagem: `apps/api/src/services/category-trends.service.test.ts`
  e `apps/api/src/establishments-report.integration.test.ts`
  (`pnpm test:establishments-report:integration`).
