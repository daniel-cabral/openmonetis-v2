# Category breakdown by subcategory

The category page header shows a **Por subcategoria** block for a root category with children. It
lists the category's month split by subcategory, and clicking a row filters the transaction list
to that subcategory. The numbers come from the server; the web only renders them and builds the
filter.

## Rules

- **Source:** `subcategoryBreakdown` is built in `calculateCategoryTrends` (`packages/domain`
  `category-trends.ts`) from the same per-category amounts as the trend totals, summed over the
  actual and recurring periods. Refunds and recurrences are counted exactly as in the trend.
- **Scope:** only root categories with children. The field is omitted for child categories and for
  categories without children. It is not part of the category detail response.
- **Rows:** one per child with a non-zero amount, plus one row with `categoryId: null` for amounts
  booked directly to the parent. Zero rows are dropped.
- **Order:** by amount descending, ties by name. The direct row (`categoryId: null`) is always last.
- **Amounts:** integer cents in the domain, returned as decimal `amount`.
- **Percentage:** `Math.round(cents * 1000 / totalCents) / 10`, one decimal. It is `0` when the
  total is not positive. Percentages are rounded per row, so they may not sum to exactly 100.
- **Empty:** no rows when the period has no amounts; the UI shows "Sem lançamentos no período.".

## Filter

The selected row is kept in the URL as `subcategory`:

- `subcategory=<child uuid>`: lists that child's transactions (`categoryIds: [childId]`).
- `subcategory=none`: lists the parent's direct transactions only. The web sends
  `categoryMatch=exact` so children are not included.
- An unknown id, or a child category page, is ignored.

Clicking the active row clears the parameter and resets pagination.

## `categoryMatch` on transactions

`GET /transactions` takes `categoryMatch`:

- `family` (default): a category filter includes its children.
- `exact`: only the selected category ids match.

The option exists so the `none` filter can list the parent's own transactions without its children.
