# Viagens

Uma viagem junta os gastos de um período, somando cartões e contas, mesmo quando a fatura cai no
mês seguinte. Ela não altera os lançamentos: é um vínculo opcional entre um lançamento e um
período. Excluir a viagem remove só os vínculos; os lançamentos continuam existindo.

## Regras

- **Período sem sobreposição:** início e fim são inclusivos. Duas viagens do mesmo usuário não
  podem compartilhar nenhum dia, inclusive ao editar. Conflito retorna `409 TRIP_OVERLAP`.
- **Elegibilidade:** só despesas e receitas de origem regular ou estorno podem ser vinculadas.
  Transferências, pagamentos de fatura, ajustes de saldo, ajustes de fatura e liquidações entre
  pessoas não. Tentativa retorna `400 TRIP_NOT_LINKABLE`.
- **Sugestão pela data:** ao criar ou copiar um lançamento, o campo Viagem sugere a viagem cujo
  período contém a data da compra, enquanto o usuário não tocar no campo. Ao editar, o valor
  armazenado é mantido.
- **Propagação nas parcelas:** vincular ou desvincular uma parcela afeta todas as parcelas da
  mesma compra.
- **Vínculo por ocorrência nas recorrências:** a regra não ganha viagem. Cada ocorrência tem seu
  próprio vínculo, guardado por série e data. Editar a ocorrência com escopo único altera só a
  data informada. Vínculos de datas que a regra deixou de gerar não aparecem na página da viagem e
  são removidos com a série.
- **Sugestões:** lançamentos sem viagem, elegíveis, com data da compra dentro do período da viagem,
  de cartões e contas. Parcelas de uma mesma compra aparecem uma vez. Vincular a seleção não
  altera o restante da lista.
- **Custo líquido:** a parte própria de cada lançamento. Em lançamento dividido, é a fatia do
  usuário administrador; sem divisão, é o valor integral quando a pessoa do lançamento é a
  administradora, e zero caso contrário. Despesas somam, reembolsos (receitas) subtraem.
  Valores são guardados em centavos inteiros no domínio.
- **Definir viagem em lote:** aplica a mesma regra de elegibilidade. Se qualquer lançamento da
  seleção não for elegível, a ação inteira é recusada com `400 BULK_ACTION_UNSUPPORTED`.

## Contrato da API

| Método e caminho | Corpo ou query | Resposta 2xx | Erros |
| --- | --- | --- | --- |
| `GET /trips` | | lista de viagens com `linkedCount` e `netCost`, por início desc e nome pt-BR | 401 |
| `POST /trips` | `CreateTripInput` | 201 `Trip` | 400, 401, 409 `TRIP_OVERLAP` |
| `PATCH /trips/{id}` | `UpdateTripInput` | 200 `Trip` | 400, 401, 404, 409 `TRIP_OVERLAP` |
| `DELETE /trips/{id}` | | 200 `{ id }` (vínculos removidos, lançamentos mantidos) | 401, 404 |
| `GET /trips/{id}` | | 200 `TripDetail` | 401, 404 |
| `GET /trips/{id}/suggestions` | `?page=1&origin=all` | 200 `TripSuggestionsPage` | 400, 401, 404 |
| `POST /trips/{id}/links` | `{ ids: string[] }` | 200 `{ ids }` (ids vinculados, após propagação) | 400 `TRIP_NOT_LINKABLE`, 401, 404 |
| `POST /trips/{id}/links/remove` | `{ ids: string[] }` | 200 `{ ids }` (somente as linhas ou ocorrências informadas) | 400, 401, 404 |
| `GET /transactions` e detalhe | | campo `tripId: uuid \| null` | |
| `POST /transactions` e `PATCH /transactions/{id}` | campo opcional `tripId` | mesma resposta, com `tripId` | 404 `TRIP_NOT_FOUND`, 400 `TRIP_NOT_LINKABLE` |
| `POST /transactions/bulk/trip` | `{ ids: uuid[1..500], tripId: uuid \| null }` | 200 `{ ids }` | 400 `BULK_ACTION_UNSUPPORTED`, 401, 404 |

## Dados

- `trips`: período, nome e anotação de cada viagem, por usuário.
- `transaction_trips`: um vínculo por lançamento. Cascata ao excluir o lançamento ou a viagem.
- `recurring_occurrence_trips`: um vínculo por série e data de ocorrência. Cascata ao excluir a
  série ou a viagem.

As tabelas são criadas pela migration `0032`.

## Verificação

```bash
pnpm test:trips:integration
```

A suíte cria um banco dedicado no PostgreSQL de desenvolvimento, aplica as migrations e o remove ao
final. Ela cobre sobreposição, custo líquido, propagação de parcelas e recorrências, sugestões,
vínculos, definir viagem em lote e isolamento entre usuários.
