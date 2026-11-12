# Quickstart: verify 007

1. `pnpm dev` (lane A ports if needed), sign in, open **Lançamentos** for a month with data.
2. **Exportar > Exportar como PDF**: `lancamentos-<aaaa-mm>.pdf` downloads; landscape, logo, title
   "Lançamentos", "Período: <mês ano>", "Gerado em: <hoje>", rule in the brand color; 9 columns;
   red expenses, green income; header repeats on page 2+.
3. Apply a date range and a category filter, export PDF and CSV: same row count and amounts;
   file name `lancamentos-<início>-<fim>.pdf`.
4. Create a transaction named `=HYPERLINK("x")`: PDF, CSV and Excel show it literally.
5. Mobile width: the actions menu offers "Exportar como PDF".
6. **Relatórios > Evolução por categoria**: **Exportar** offers CSV (unchanged name
   `tendencias-...csv`), Excel and PDF; PDF and Excel show one column per month plus Total,
   variation per month ("↑ 12,5%"), "Total Geral - Despesas" / "- Receitas" equal to the screen's
   "Total mensal" rows and summary.
7. Network tab: no request leaves the app origin during PDF/Excel export.
