# Quickstart: Fork Leftovers (015)

Prerequisites: lane database migrated (`pnpm db:migrate`), root `.env` of the worktree (integration
tests load it themselves). Run integration scripts from bash (they use `VAR=1 tsx ...`).

## Automated checks

```bash
pnpm exec tsx --test packages/domain/src/invoices.test.ts packages/domain/src/category-trends.test.ts
pnpm exec tsx --test apps/web/src/features/invoices/invoices.presentation.test.ts
pnpm test:financial-integrity:integration   # stale/over-balance 409, covered invoice, no writes
pnpm test:connections:integration           # recipient cannot mutate owner data
pnpm test:transactions:integration          # categoryMatch=exact
```

## Manual

1. Card with an invoice of R$ 19.063,54 including R$ 5.000,00 of credit lines and R$ 2.320,62 paid:
   open "Registrar pagamento" -> callout "Fatura de R$ 19.063,54, R$ 7.320,62 já abatidos. Confirmar
   vai registrar R$ 11.742,92." Confirm -> account statement shows R$ 11.742,92.
2. "Valor parcial" R$ 1.000,00 -> callout ends with "Restará R$ 10.742,92."
3. Pay the rest in another tab, then confirm in the first -> callout refreshes with the stale message;
   nothing recorded.
4. Fully covered invoice -> "Os pagamentos e créditos do período já cobrem esta fatura. Nada será
   lançado." and confirm disabled.
5. Moradia 2026-10 with the spec fixture -> "Por subcategoria" rows 63,2 / 14,7 / 10,8 / 7,0 / 4,3,
   sum R$ 4.432,30 equal to the header total. Click "Faxina" -> URL `?subcategory=<id>`, list filtered;
   click again -> cleared; "Sem subcategoria" -> only Moradia direct transactions; reload keeps it.
6. Child category page or category without children -> no block.

Contracts: [contracts/api-changes.md](contracts/api-changes.md).
