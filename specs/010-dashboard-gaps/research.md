# Research: 010 Dashboard Gaps

## R1. Spending overview data source
- Decision: reuse the 005 repository reads for a one-month window plus a new domain function reusing `isEstablishmentPurchase` and `listRuleOccurrences`.
- Rationale: one purchase rule for the report and the widget (FR-004, spec Clarifications); admin-share SQL already exists and is integration-tested.
- Alternatives: extend `GET /dashboard/snapshot` (rejected: different eligibility rule, grows every dashboard load); call `/reports/establishments` with months=1 (rejected: months is 3/6/12 and no per-transaction list).

## R2. Top expenses row identity and date
- Decision: add `id` and `purchaseDate` to the 005 purchase entry select; recurring occurrences use the occurrence `purchaseDate` and key `ruleId:purchaseDate`.
- Rationale: rows need a stable React key and the purchase date (US1-1).

## R3. Attachments summary
- Decision: new `GET /attachments/summary?period=`; domain `summarizePeriodAttachments` over `listLinksForPeriod` rows (all people).
- Rationale: the paginated list has counts but no total size and is ordered for the library; the widget needs dedupe, bytes and top 5 by purchase date.
- Alternatives: reuse `GET /attachments` (rejected: no size sum, fixed page sizes, different ordering).

## R4. Category history
- Decision: web-only over `categoryTrendsQueryOptions` with `startPeriod`, `endPeriod`, `categoryIds`, `personScope: "admin"`; plotted value `values[].totalAmount`; picker options from the trends response `availableCategories` (grouped by `type`).
- Rationale: FR-008/SC-004 equality is guaranteed by using the same endpoint.

## R5. Widget id migration
- Decision: append `spending-overview`, `category-history`, `attachments` to `dashboardWidgetIds`; default-order detection also compares against the pre-010 id list.
- Rationale: FR-002/SC-003; normalization already appends missing ids at the end.

## R6. Notifications
- Decision: tests only (service level, existing fake fixture). Web conflict reload already happens via `onSettled -> invalidateQueries`.
