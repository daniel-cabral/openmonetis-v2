# Ações em massa de lançamentos

Duas ações operam sobre vários lançamentos de uma vez: **Adicionar em massa** cria lançamentos
avulsos em um envio, e **Editar** altera campos de uma seleção. A API é a única fonte de verdade:
toda regra roda no domínio e o cliente só apresenta o resultado. As duas ações são tudo ou nada:
qualquer erro significa zero gravações.

## Adicionar em massa

`POST /transactions/bulk/create` recebe configurações comuns e uma lista de linhas (1 a 500).

- Configurações comuns: `type` (`income` ou `expense`) e `paymentMethod`.
- Cartão (`credit_card`): `cardId` obrigatório e `invoicePeriod` opcional. Sem `accountId`.
- Demais formas: `accountId` obrigatório. Sem `cardId` nem `invoicePeriod`.
- Cada linha: `purchaseDate`, `name`, `amount` (positivo), `categoryId` e `personId`.

Todas as linhas são criadas como lançamentos avulsos (`condition` `single`), sem parcelas,
recorrência, observação ou divisão. Em cartão, a fatura de cada linha segue a regra do cartão, ou
a fatura escolhida em `invoicePeriod`. Em conta, a linha nasce pendente.

Validações, na ordem:

1. Formato da requisição (Zod): tamanho da lista, campos e cartão ou conta conforme a forma de pagamento.
2. Referências, em leitura única antes de qualquer gravação: conta ou cartão do usuário e ativo,
   categoria compatível com o tipo (sem a categoria de pagamento de fatura) e pessoa ativa.
3. Limites de cartão: fatura resultante paga (`INVOICE_ALREADY_PAID`) e limite excedido
   (`CARD_LIMIT_EXCEEDED`).

Referências inválidas respondem 404 com o código do recurso (`CATEGORY_NOT_FOUND`,
`PERSON_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `CARD_NOT_FOUND`). A mensagem não informa o número da
linha. Na tela, o diálogo valida data, estabelecimento e valor de cada linha antes do envio e mostra
o número da linha junto ao erro.

Sucesso responde 201 com `{ data: { ids } }`, na ordem das linhas.

## Editar

`PATCH /transactions/bulk/update` recebe `ids` (até 500), `scope` e `changes`. Só os campos
enviados em `changes` são alterados. Campos aceitos: `purchaseDate`, `invoicePeriod`, `dueDate`
(anulável), `personId`, `accountId`, `cardId`, `categoryId`, `note` (anulável) e `amount`. Chaves
desconhecidas, como `condition`, `isSettled` ou `boletoPaymentDate`, são rejeitadas pelo contrato.
A situação de baixa não é editada aqui: ela muda pela ação de baixa da barra de seleção.

### Campos por forma de pagamento

| Campo | Cartão | Conta, Pix e demais |
| --- | --- | --- |
| `accountId` | não se aplica | aplica |
| `cardId`, `invoicePeriod` | aplica | não se aplica |
| `dueDate` | não se aplica | só em despesas |

Se algum campo pedido não se aplica a um lançamento da seleção, a ação inteira é rejeitada
(`BULK_UPDATE_FIELD_NOT_APPLICABLE`). O diálogo avisa antes do envio, listando os campos afetados
por forma de pagamento.

### Ordem das rejeições

1. Ids: qualquer id ausente ou de outro usuário responde 404 `TRANSACTION_NOT_FOUND`.
2. Referências alteradas: pessoa, categoria, conta e cartão precisam pertencer ao usuário e estar
   ativos (ou não arquivados, no caso da conta).
3. Por lançamento:
   - `BULK_ACTION_UNSUPPORTED`: protegido (pagamento de fatura, saldo inicial, reembolso, perna de
     transferência, ajuste de saldo).
   - `BULK_UPDATE_RECURRING`: ocorrência recorrente. Recorrências são editadas uma a uma pelo
     fluxo de edição com escopo.
   - `BULK_UPDATE_FIELD_NOT_APPLICABLE`: campo que não se aplica à forma de pagamento.
   - `BULK_UPDATE_SPLIT_PERSON`: troca de pessoa em lançamento dividido.
4. Categoria compatível com o tipo de cada lançamento (`BULK_CATEGORY_INCOMPATIBLE`).
5. Escopo das parcelas e baixa (`SETTLEMENT_REQUIRES_UNDO`).
6. Faturas pagas, na origem e no destino (`INVOICE_ALREADY_PAID`).
7. Gravação única. Se alguma linha planejada não for atualizada, a transação inteira é revertida e
   a resposta é 404 `TRANSACTION_NOT_FOUND` (por exemplo, um lançamento apagado entre o planejamento
   e a gravação).

Sucesso responde 200 com `{ data: { ids } }`, incluindo as linhas da série que entraram no escopo.

### Parcelas: escopo

O campo `scope` vale só para itens de parcelamento. Lançamentos avulsos ignoram o escopo.

- `single`: apenas os itens selecionados (padrão).
- `future`: o item selecionado e as parcelas seguintes da mesma série.
- `series`: toda a série.

A âncora de cada série é a parcela selecionada de menor número. Ao alterar datas ou período, cada
parcela coberta recebe o deslocamento em meses igual à diferença entre o número da parcela e o da
âncora. Dia fora do mês é ajustado para o último dia do mês: `2026-01-31` com deslocamento de um mês
vira `2026-02-28`. Vencimento e período seguem o mesmo deslocamento. Valor e demais campos são
copiados sem deslocamento.

Se uma parcela no escopo estiver baixada e o campo alterado for travado pela baixa, a ação inteira é
rejeitada.

### Divisões

Um lançamento dividido é uma única transação com parcelas de rateio. Qualquer edição vale para o
lançamento inteiro, nunca só para a parte de uma pessoa. Ao alterar o valor, o rateio é
redistribuído proporcionalmente, em centavos, e a soma das partes é igual ao novo valor. Trocar a
pessoa de um lançamento dividido é rejeitado.

### Baixa e faturas pagas

- Lançamento baixado: alterar valor, data, pessoa, conta, cartão, período ou vencimento exige desfazer
  a baixa antes (`SETTLEMENT_REQUIRES_UNDO`). Categoria e observação não são travadas pela baixa.
- Lançamento de cartão: se cartão, fatura, data ou valor mudar, a fatura de origem e a de destino
  precisam estar abertas. Assim, o total de uma fatura paga nunca muda (`INVOICE_ALREADY_PAID`). A
  mensagem não lista os meses.

## Ações em massa existentes

| Ação | Método e rota | Observação |
| --- | --- | --- |
| Categoria | `PATCH /transactions/bulk/category` | |
| Nomes | `PATCH /transactions/bulk/names` | |
| Tags | `PATCH /transactions/bulk/tags` | |
| Viagem | `POST /transactions/bulk/trip` | |
| Excluir | `POST /transactions/bulk/delete` | |
| Adicionar em massa | `POST /transactions/bulk/create` | Novo |
| Editar | `PATCH /transactions/bulk/update` | Novo |

Todas exigem sessão, respondem com `{ data, error: null }` ou `{ error: true, message, code }` e
enviam `Cache-Control: private, no-store`.

## Limites e fora do escopo

- Até 500 itens por envio, nas duas ações. O diálogo bloqueia a seleção acima do limite.
- Recorrências não entram na edição em massa. A seleção que contém uma delas é rejeitada inteira,
  com a mensagem "Lançamentos recorrentes devem ser editados individualmente.".
- Condição (`à vista`, `parcelado`, `recorrente`) não é alterada em massa.
- Baixa e data de pagamento de boleto não são campos de edição em massa.

## Veja também

- `docs/settlements.md`: baixas, valores efetivos e desfazer.
- `docs/recurring-transactions.md`: regras de recorrência e edição com escopo.
