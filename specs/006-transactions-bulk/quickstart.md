# Quickstart: validating mass-add and bulk edit (006)

Worktree `.claude/worktrees/006-transactions-bulk`; the root `.env` points to the lane database.
Run the integration suite from bash (the script uses `VAR=1 tsx ...`). No migration to generate.

## Automated checks (bash)

```bash
node --import tsx --test packages/domain/src/transactions.test.ts
node --import tsx --test apps/web/src/features/transactions/transactions.presentation.test.ts
pnpm test:transactions:integration   # creates and drops its own database
pnpm check                           # lint + typecheck + migrations check (no new migration)
```

Expected: all green. The integration suite proves SC-002 (no rows after a bad row), SC-004
(offsets with month-end clamp, earlier installments untouched), SC-005 (protected, paid-invoice and
settled rejections with zero writes) and user isolation.

## Manual walk-through (optional; use non-default ports if another lane runs)

1. Lançamentos -> "Novo lançamento" -> "Adicionar em massa". Despesa, cartão, keep the invoice;
   3 rows; "Criar 3 lançamentos" -> toast "3 lançamentos criados com sucesso." and rows in the
   invoice.
2. Same dialog with Pix and no account -> "Selecione uma conta para continuar"; empty value in a
   row -> required-fields message; remove the only row -> "É necessário ter pelo menos uma
   transação"; close after typing -> "Descartar" / "Continuar editando".
3. Card page -> "Adicionar em massa": card locked, invoice = selected period.
4. Select 3 single rows -> dock "Editar" -> Alterar pessoa + data da compra -> rows updated, other
   fields unchanged.
5. Select installment 3/10 -> "Editar" -> due date on the 31st, "Este e os próximos" -> 1-2
   unchanged, 3-10 monthly, February clamped.
6. Include a recurring occurrence -> "Lançamentos recorrentes devem ser editados individualmente.";
   include a refund -> protected message; a paid item + amount -> undo-settlement message.
