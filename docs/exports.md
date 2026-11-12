# Exportações em PDF, Excel e CSV

Os lançamentos e o relatório de **Tendências por categoria** exportam para arquivos. A API é a única
fonte dos números: o cliente só monta o arquivo com o que recebeu, sem somar, arredondar ou recalcular
totais. O PDF e o Excel são gerados no navegador do usuário; nenhum dado sai da origem do app.

## Formatos por tela

| Tela                                           | CSV                  | Excel (.xlsx) | PDF |
| ---------------------------------------------- | -------------------- | ------------- | --- |
| Lançamentos (menu Exportar, desktop e mobile)  | sim                  | sim           | sim |
| Relatórios > Evolução por categoria (Exportar) | sim (nome inalterado) | sim          | sim |

## Lançamentos em PDF

Página A4 paisagem, com:

- cabeçalho com a marca e o logotipo (quando carregam);
- título **Lançamentos**;
- linhas **Período: <rótulo>** e **Gerado em: dd/mm/aaaa** (dia local do usuário);
- régua na cor principal do tema.

Colunas, nesta ordem: Data, Nome, Tipo, Condição, Pagamento, Valor, Categoria, Conta/Cartão, Pessoa.

- **Nome**: parcelas mostram `(n/total)` ao lado do nome.
- **Condição**: "Recorrente" quando o lançamento é recorrente; caso contrário, o rótulo da condição.
- **Pagamento**: "Ajuste de saldo" para ajustes de saldo; "-" quando não se aplica.
- **Valor**: valor da parte da pessoa em lançamentos divididos; senão, o valor do lançamento.
- **Conta/Cartão**: transferências mostram "origem para destino".
- **Pessoa**: pessoa da divisão quando existe; senão, a do lançamento.
- Campo vazio aparece como "-".
- Despesas em vermelho, receitas em verde, transferências na cor neutra.
- O cabeçalho da tabela repete em todas as páginas e o texto quebra em linhas, sem cortar colunas.

### Rótulo de período e nome do arquivo

| Filtro                       | Rótulo                      | Arquivo                                |
| ---------------------------- | --------------------------- | -------------------------------------- |
| Mês (`period=2026-10`)       | outubro 2026                | `lancamentos-2026-10.pdf`              |
| Intervalo completo           | 01/10/2026 até 15/10/2026   | `lancamentos-2026-10-01-2026-10-15.pdf` |
| Só data final                | Início até 15/10/2026       | `lancamentos-inicio-2026-10-15.pdf`    |
| Só data inicial              | 01/10/2026 até hoje         | `lancamentos-2026-10-01-hoje.pdf`      |

Quando a exportação é de extrato de conta, o nome recebe o mesmo sufixo que o CSV e o Excel.

## Relatório de Evolução por categoria

Colunas: Categoria, um mês por coluna e Total. Cada mês mostra o valor e, abaixo, a variação em
relação ao mês anterior. O primeiro mês do período não tem variação.

- Categorias de despesa vêm primeiro, depois as de receita. Cada tipo termina com a linha
  **Total Geral - Despesas** ou **Total Geral - Receitas**. Um tipo sem categorias não aparece.
- Os totais mensais e os totais gerais vêm de `periods[].expenseAmount`, `periods[].incomeAmount` e
  `summary`, e não da soma das linhas exibidas.
- Variação: percentual com sinal (`+12,5%`, `-25%`). A direção segue o sinal de `changeAmount`.
- "Novo" quando a categoria começou no mês, sem seta. "Sem base" quando não há percentual.
- Título: **Relatório de Categorias por Período**. Período: `Janeiro 2026 - Março 2026`.
- Arquivos: `relatorio-categorias-<início>-<fim>.pdf` e `.xlsx`. O CSV mantém
  `tendencias-<início>-<fim>.csv`.

## Layout do Excel

Uma aba, **Relatório de Categorias**, com cabeçalho em negrito e primeira linha fixa:

- `Categoria` e `Tipo` (Despesa ou Receita);
- para cada mês, o valor como número no formato `"R$" #,##0.00` e, em seguida, `<Mês> var.` como texto;
- `Total` como número.

Na coluna de variação, a seta fica no texto: `↑ 12,5%` para alta, `↓ 25%` para queda. "Novo" e
"Sem base" saem sem seta. Valores continuam numéricos, então podem ser ordenados e somados no Excel.

## Segurança contra fórmulas

Textos entram como texto literal. O Excel recebe as strings como valores de célula, nunca como
fórmulas: um nome como `=HYPERLINK("x")` aparece exatamente assim, sem ser executado. O CSV de
Tendências continua escapando esses valores, como já fazia antes desta mudança.

## Onde os arquivos são construídos

- `jspdf`, `jspdf-autotable` e `exceljs` ficam fora do bundle inicial. São carregados com `import()`
  só quando o usuário escolhe PDF ou Excel.
- Cor: a variável `--primary` do tema. Sem valor, usa o coral padrão `#c96a3a`.
- Logos: `/images/openmonetis-mark.svg` e `/images/openmonetis-wordmark.svg`, convertidos para PNG no
  navegador. Se falharem, o PDF sai sem logos.
- O arquivo só é baixado depois que o gerador termina, então uma falha não deixa arquivo parcial.
- Nenhuma requisição sai da origem do app durante a exportação.

Os geradores ficam em `apps/web/src/lib/`: `pdf-export.ts`, `xlsx-export.ts` (sem acesso ao DOM),
`export-branding.ts` (somente no navegador) e `download-blob.ts`.

## Contrato: `GET /transactions/export/items`

Lista todos os lançamentos que batem com os filtros da tela, sem paginação. É a fonte das linhas do
PDF de lançamentos.

- Autenticação: sessão, igual a `GET /transactions/export`. Sem sessão, 401.
- Cabeçalho de resposta: `Cache-Control: private, no-store`.
- Query: `ListTransactionsQuery`, com todos os filtros da listagem. `page` e `pageSize` são aceitos e
  ignorados. Sem `period`, usa o mês atual no fuso de Brasília.
- 200: `{ "data": { "items": TransactionOutput[], "rowCount": number }, "error": null }`, com
  `rowCount === items.length`.
- 400: query inválida, no mesmo formato da listagem.
- Tag OpenAPI `Transactions`, schema `TransactionExportItems`.

Para a mesma query, `rowCount` e os valores da coluna "Valor (R$)" do CSV batem com os de `items`,
na mesma ordem.

## Verificação

Roteiro manual completo em `specs/007-pdf-exports/quickstart.md`.

Testes automatizados:

- `pnpm test:transactions:integration`: endpoint de itens, paridade com o CSV e ausência de sessão.
- `FINANCIAL_INTEGRITY_INTEGRATION_TEST=1 pnpm exec tsx --test apps/api/src/financial-integrity.integration.test.ts`:
  isolamento entre usuários.
- `node --import tsx --test apps/web/src/lib/pdf-export.test.ts apps/web/src/lib/xlsx-export.test.ts`:
  PDF com várias páginas e Excel com texto literal.
- `node --import tsx --test apps/web/src/features/transactions/transactions.presentation.test.ts apps/web/src/features/category-trends/category-trends.presentation.test.ts`:
  rótulos, nomes de arquivo, linhas e tabelas de exportação.
