# Widgets do dashboard: panorama, anexos e histórico

Três widgets do dashboard mostram dados do período escolhido no topo da página: **Panorama de
gastos**, **Anexos** e **Histórico de categorias**. Eles só leem dados já registrados: não criam
lançamentos nem alteram nada. As regras ficam no domínio (`packages/domain`); os widgets apenas
apresentam o resultado.

## Registro no dashboard

- Os três entram no seletor de widgets do dashboard e seguem as mesmas ações dos demais: mostrar,
  ocultar, reordenar e restaurar o padrão.
- **Panorama de gastos** e **Histórico de categorias** ficam na seção **Análises do período**.
  **Anexos** fica na seção **Planejamento**, ao lado das notas.
- Layouts salvos antes da atualização mantêm ordem e itens ocultos. Os widgets novos são
  acrescentados ao final e aparecem por padrão.

## Panorama de gastos

Duas abas, cada uma com até 10 itens:

- **Top gastos:** as maiores despesas individuais do mês, por valor decrescente. Cada linha mostra
  logo, nome, data da compra e valor. Empates: data da compra mais recente primeiro, depois nome.
- **Estabelecimentos:** os lugares onde mais se comprou no mês, agrupados pelo nome exato do
  lançamento (diferencia maiúsculas). Ordem: quantidade de compras, depois total, depois nome em
  pt-BR. Cada linha mostra `{N} lançamentos · total acumulado` (`1 lançamento` quando N é 1) e o
  total.

### Regra de contagem

A regra é a mesma de compra do relatório de estabelecimentos (ver `docs/establishments-report.md`),
reutilizada do domínio:

- Só despesas de origem regular, fora de contas marcadas como fora do saldo e fora da categoria de
  pagamento de fatura.
- Pagos e pendentes contam. Cada parcela e cada ocorrência recorrente expandida no período conta
  como uma linha.
- Em lançamento dividido, conta só a parte do usuário administrador.
- Estornos são excluídos, não subtraídos.
- A exclusão é por origem tipada, não por texto do nome: uma despesa chamada "Fatura de energia"
  aparece normalmente.

Transferências, pagamentos de fatura, saldos iniciais, ajustes de fatura e de saldo e
liquidações entre pessoas não aparecem em nenhuma aba.

O rodapé **Ver relatório de estabelecimentos** abre `/reports/establishments` no mesmo período.

### Endpoint

`GET /dashboard/spending-overview?period=YYYY-MM`

Retorna `period`, `topExpenses` e `topEstablishments`. Valores são decimais na resposta e centavos
inteiros no domínio. Usuário sem pessoa administradora recebe listas vazias, sem erro.

## Anexos

Resumo dos comprovantes ligados aos lançamentos do período:

- Chips com total de anexos, tamanho total e contagens de imagens e PDFs. Chip de contagem zerada
  não aparece.
- Lista com os 5 anexos mais recentes, pela data de compra do lançamento vinculado (mais recente
  primeiro). Cada linha mostra ícone do tipo, nome do arquivo (nome completo no `title`), nome do
  lançamento, dia/mês e tamanho.
- Clicar em uma linha abre a prévia com os 5 itens listados, navegáveis entre si.
- Rodapé **Ver todos** abre a biblioteca de anexos com o mesmo período.

### Escopo

- Entram todos os anexos ligados a lançamentos do usuário no período, de todas as pessoas dele, o
  mesmo conjunto padrão da biblioteca sem filtro de pessoa.
- Um anexo ligado a vários lançamentos do período conta uma vez e usa a data da compra mais recente
  entre eles.
- Tamanho total é a soma dos tamanhos dos arquivos, em bytes.

### Endpoint

`GET /attachments/summary?period=YYYY-MM`

Retorna `period`, `count`, `totalBytes`, `imageCount`, `pdfCount` e `recent` (até 5 itens com `id`,
`fileName`, `mimeType`, `fileSize`, `transactionName` e `purchaseDate`). Só os anexos do próprio
usuário.

## Histórico de categorias

Gráfico de linhas com até 5 categorias e uma janela de 10 meses: os 8 meses anteriores ao mês
escolhido, o próprio mês e o seguinte.

- O seletor agrupa as opções em **Despesas** e **Receitas**, não oferece categorias já escolhidas e
  para em 5.
- Sem categoria escolhida, o widget mostra um convite para escolher categorias e nenhum gráfico.
- Cada categoria tem uma cor distinta. Meses sem lançamentos valem zero.
- Os valores são os totais mensais da parte do usuário, com recorrências expandidas e pais somando
  os filhos. Pagamentos de fatura, transferências e ajustes de saldo ficam de fora.
- Os números são os mesmos do relatório de **Tendências por categoria** para as mesmas categorias e
  meses. Não há endpoint novo: o widget usa o relatório existente.

### Memória da seleção

A seleção fica em `sessionStorage`, ou seja, vale só para a aba do navegador. Ao recarregar o
dashboard na mesma aba, a seleção volta (até 5). Categorias que não existem mais são descartadas.
Uma sessão nova começa vazia.

## Notificações: marcar como não lida e restaurar

Não há nova funcionalidade: o painel de notificações já permite as duas direções. Os testes em
`apps/api/src/services/notifications.service.test.ts` cobrem o comportamento:

- Marcar como lida e depois como não lida: a notificação volta para **Nova** e o contador atualiza.
- Arquivar uma notificação arquivável: ela vai para **Arquivadas** e conta como lida.
- Restaurar uma arquivada: ela volta à lista ativa, já como lida.
- Arquivar uma notificação que exige ação é recusado.
- Ação sobre uma notificação desatualizada (fingerprint novo) é recusada com conflito, e o painel
  recarrega.

Regra da V2: notificação arquivada já é lida, então não pode ser marcada como não lida. A V1 permitia
isso.

## Testes

- Regra de contagem do panorama e ordenação: `packages/domain/src/spending-overview.test.ts`.
- Panorama com banco real e isolamento por usuário:
  `apps/api/src/spending-overview.integration.test.ts` (`pnpm test:spending-overview:integration`).
- Resumo de anexos: `apps/api/src/services/attachments.service.test.ts`.
- Notificações: `apps/api/src/services/notifications.service.test.ts`.
