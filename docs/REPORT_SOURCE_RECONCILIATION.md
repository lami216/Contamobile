# Report sources and visual revision

Reference: Offline Conta `app/conta-app.tsx` Reports/overviewMetricDetail and SummaryBreakdownDialog, `app/report-types.ts` and `app/bank-filters.ts`, read from main on 2026-10-10.

Each report metric opens a read-only breakdown using the metric's exact committed period. Current balances and stock are explicitly current/all-time. Components open the contributing operations; opening balances are shown separately. Net profit is revenue minus recorded historical sale cost minus period expenses. Historical cost uses invoice total minus its stored profit and does not revalue old sales using today's product cost.

Invoice `due` is the credit posted at issue. Later unallocated party receipts/payments change the party ledger, not that historical field. Sales reports label it credit at sale and separately show the current customer net. A reconciliation shows period credit, other-period/unlinked credit, opening balances, receipts, payments and other live movements. It reports any unexplained residual without modifying stored balances or assuming invoice-specific receipt allocations. The user's difference of 75,151 is a regression fixture, not a claim to have inspected their live data.

Current amounts owed to/from us are derived per party's signed balance, including reverse supplier/customer positions; different parties are never offset. Cancelled operations are excluded. All ten report types have traceable amounts/counts and bounded source tables.

Gold is reserved for borders. Labels, amounts and primary fills use neutral/semantic colors. All list rows use one dark background (one white background in daytime); alternating row fills are removed. Table amounts and currency remain on one line at mobile widths. Existing pagination scroll preservation, fixed sheet headers, keyboard behavior and source-location navigation are retained.

Validation: pure report/reconciliation regressions, 10 report types in a real browser at 393/360 px, light/dark, source drilldown to invoice, uniform row colors, page position across pagination, previous seller/accounting/navigation tests, and Android integration with report profit/credit drilldown.
