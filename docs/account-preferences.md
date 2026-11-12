# Preferências de lançamentos e troca de e-mail

Seis preferências da conta ficam em `user_preferences` e aparecem em **Ajustes > Preferências**.
Cada campo é salvo por conta, sem afetar os demais. A API é a fonte da verdade; a tela só renderiza
o que ela devolve.

## Preferências

| Campo | Padrão | Efeito |
| --- | --- | --- |
| `transactionsColumnOrder` | `null` (ordem padrão) | Ordem das colunas da lista de lançamentos. |
| `groupTransactionsByDate` | `true` | Cabeçalho com a data antes de cada dia, na tabela e na lista do celular. |
| `hideAnticipatedInstallments` | `false` | Esconde da lista as parcelas antecipadas. |
| `showTransactionSummary` | `true` | Mostra o bloco de resumo nos detalhes do lançamento. |
| `transactionNoteAsColumn` | `false` | Mostra a anotação numa coluna própria. |
| `attachmentMaxSizeMb` | `50` | Tamanho máximo de novos anexos: 5, 10, 25 ou 50 MB. |

### Colunas e ordem tolerante

Os ids aceitos são `name`, `amount`, `condition`, `paymentMethod`, `note` e `account`. A seleção
fica sempre primeiro e Ações sempre por último.

`resolveTransactionColumnOrder` (domínio) aplica a ordem salva de forma tolerante:

- ids desconhecidos (por exemplo, `type` de versões anteriores) são descartados;
- duplicados mantêm só a primeira ocorrência;
- colunas que faltam entram no fim, na ordem padrão;
- `note` sai da lista quando `transactionNoteAsColumn` está desligado.

A API aceita no `PATCH` apenas ordens com ids válidos, sem repetição e com até seis colunas.

### Parcelas antecipadas

`hideAnticipatedInstallments` vale só para a lista de `GET /transactions`, inclusive o total de
paginação. Exportações (`GET /transactions/export/items`), calendário, relatórios, saldos e
faturas não mudam.

### Limite de anexo

O limite é checado no servidor ao preparar o upload (`POST /attachments/prepare` para lançamentos
e `POST /attachments/note/prepare` para anotações). Um arquivo acima do limite responde 400
`attachment_too_large` e nenhum registro de anexo é criado. O teto da instalação continua em 50 MB.
Anexos já enviados não são revalidados.

No web, o seletor de arquivo usa o mesmo limite para avisar antes do envio.

## Contrato `POST /settings/email`

Troca o e-mail de login da conta. Exige sessão, responde com `Cache-Control: private, no-store` e
entra no limite de `/settings/*` (5 por minuto).

Entrada: `{ "newEmail": string, "currentPassword"?: string }`. O e-mail é normalizado com `trim` e
minúsculas antes da validação.

| Situação | Resposta |
| --- | --- |
| Sucesso | 200 `{ email, verificationEmailSent }` |
| Igual ao atual, sem diferenciar maiúsculas | 400 `email_unchanged` |
| Senha atual errada ou ausente, e-mail já usado por outra conta, ou troca recusada | 400 `email_change_rejected` (mesma resposta nos dois últimos casos, para não revelar contas) |
| Conta sem senha (Google) com sessão iniciada há mais de 10 minutos | 403 `fresh_session_required` |

Regras:

- Contas com senha confirmam a troca com `currentPassword`. Contas só com Google não têm senha e
  precisam de uma sessão recente (até 10 minutos).
- A troca grava o novo e-mail em `user` (não verificado) e no registro da pessoa `admin`.
- Todas as outras sessões da conta são encerradas. A sessão que fez a troca continua ativa.
- Passkeys e contas externas (Google) não mudam.
- `verificationEmailSent` é `true` só quando o Resend está configurado (ver
  `RESEND_API_KEY` e `EMAIL_FROM` em [variáveis de ambiente](environment-variables.md)). Sem Resend,
  nenhum e-mail é enviado e a tela informa isso.
- Falhas de envio são registradas no servidor sem o endereço digitado e não alteram o resultado.

## Migração

`packages/db/drizzle/0037_account_preferences.sql` adiciona seis colunas em `user_preferences`:
`transactions_column_order` (nula), `group_transactions_by_date`, `hide_anticipated_installments`,
`show_transaction_summary`, `transaction_note_as_column` e `attachment_max_size_mb`. Os valores
padrão preenchem contas existentes sem alterar dados.
