# Relatório de uso de cartões

O relatório **Uso de cartões** mostra, para o mês escolhido, quanto do limite de cada cartão ativo
o usuário já usou, com a comparação com o mês anterior. Ao escolher um cartão, ele detalha 12 meses
de uso, a situação das faturas, as categorias e os maiores gastos. Ele não cria lançamentos nem
altera dados: lê as despesas e as recorrências já registradas. As regras ficam no domínio
(`packages/domain/src/card-usage-report.ts`).

## Regras

- **Parte própria:** em lançamento dividido, conta só a parte do usuário administrador. Os valores
  são calculados em centavos inteiros no domínio e chegam à API como valores decimais.
- **Impacto no limite:** despesas aumentam o uso. Estornos (origem `refund`, tipo receita) e ajustes
  de fatura positivos abatem o uso do mês em que caem. O uso de cada mês nunca fica negativo.
- **O que não conta:** transferências, pagamentos de fatura, créditos de fatura, ajustes de saldo,
  liquidações entre pessoas e lançamentos na categoria de pagamento de fatura.
- **Recorrências:** só regras ativas. Cada regra gera ocorrências dentro do período consultado, mas
  apenas as que têm data até hoje (horário de Brasília) entram no uso. Regras pausadas não entram.
- **Mês de referência:** cada lançamento cai no mês da sua fatura (`period`), não na data da compra.
- **Limite zero:** o percentual é `0` e o tom é de sucesso.
- **Tom do uso:** abaixo de 50% é sucesso, de 50% a menos de 80% é alerta e a partir de 80% é
  perigo. Os totais do resumo seguem a mesma regra.
- **Disponível:** limite menos uso, nunca abaixo de zero.
- **Tendência:** compara o uso do mês com o do mês anterior. Variação acima de +5% é **Alta**,
  abaixo de -5% é **Queda**, e o restante é **Estável**. Sem uso no mês anterior e com uso no mês
  atual, a variação é +100% (Alta). Sem uso nos dois meses, é 0% (Estável).
- **Ordem dos cartões:** pelo uso do mês (maior primeiro), depois pelo nome em ordem pt-BR e, por
  fim, pelo id.
- **Cartão selecionado:** o cartão pedido em `cardId`, se estiver na lista. Sem `cardId`, ou com um
  id inativo, desconhecido ou de outro usuário, vale o primeiro da lista. Sem cartões ativos, não há
  seleção.
- **Histórico:** 12 meses terminando no mês escolhido, incluindo meses sem uso (valor zero).
- **Categorias do mês:** uso líquido por categoria (estornos abatem), só categorias com saldo
  positivo, ordenadas pelo valor. Lançamentos sem categoria entram em um grupo próprio, sem nome
  nem ícone. O percentual é sobre o uso total do mês. Até 10 itens.
- **Maiores gastos do mês:** só lançamentos com impacto positivo (estornos ficam de fora), ordenados
  pelo valor, depois pela data mais recente e pelo nome em ordem pt-BR. Até 10 itens.
- **Faturas:** uma situação por mês do histórico, a partir da fatura do cartão:
  - `paid`: fatura paga.
  - `none`: sem valor e sem registro de fatura. O valor não é exibido.
  - `overdue`: fatura atrasada.
  - `pending`: demais casos com valor ou registro (aberta ou fechada, ainda não paga).

## Endpoint

`GET /reports/card-usage`

| Parâmetro | Valores | Padrão | Observação |
|---|---|---|---|
| `period` | `YYYY-MM` | mês atual | mês do relatório |
| `cardId` | UUID | ausente | cartão a detalhar; inválido ou inativo cai no primeiro da lista |

Período inválido ou `cardId` que não é UUID retornam `400`. A resposta traz `period`, `summary`
(`totalLimit`, `totalUsed`, `totalAvailable`, `usagePercentage`, `tone`), `cards` (uso, disponível,
percentual, tom, valor do mês anterior, variação e tendência de cada cartão), `selectedCardId` e
`detail` (`cardId`, `history`, `invoices`, `categories` e `topExpenses`). Sem cartão selecionado,
`detail` é `null`.

## Tela

Rota web `/reports/card-usage`, com os parâmetros de busca:

- `period`: mês no formato `YYYY-MM`. Mudar o mês mantém o cartão selecionado.
- `card`: id do cartão selecionado. Escolher um cartão na lista atualiza este parâmetro.

Em telas menores que `lg`, a lista e o detalhe aparecem em uma coluna só.

## Testes

- Regras de uso, tom, tendência, faturas, detalhe e visão geral: `packages/domain/src/card-usage-report.test.ts`.
- Mapeamento dos parâmetros de busca e rótulos: `apps/web/src/features/card-usage-report/card-usage-report.presentation.test.ts`.
- Fluxo HTTP sobre lançamentos reais, parte própria, estornos, faturas, troca de cartão e isolamento
  entre usuários: `apps/api/src/card-usage-report.integration.test.ts`
  (`pnpm test:card-usage-report:integration`).
