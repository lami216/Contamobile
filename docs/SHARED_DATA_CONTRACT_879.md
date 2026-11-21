# Desktop main879 data and report contract

Reference: `lami216/offline-conta` main commit `8a6cb072c411ee698f3ca5a0f1943be80ccd2955`, Desktop0.1.25/build879. Phone baseline: approved v36 (`c625c2e226e5ac16e1a44c7ad93dcd68e188c65f`).

## Employee opening balances

`employee-opening` is an audited, noncash worker account document. `employeeOpeningDirection=payable` increases the worker liability; `receivable` decreases it. Positive `total/amount`, exact signed `balanceDelta`, source business date/order/revision and audit snapshots remain authoritative. `cashAmount`, `paidTotal`, `dueTotal`, and the phone's `paid/due` aliases are zero; `paymentMethod` and phone `account` are null. The document has no product lines or financial movement.

The opening is not itself wage expense, income or salary reserve. Subsequent payroll recognition uses the exact main879 chronological rules. In particular, paying an existing payable opening does not recognize new wages, and an existing receivable opening may offset an actual later salary accrual. An early cash document retains its audited `employeeOpeningAnchor` even if the original opening is later edited or canceled.

## Import, backup and upgrade

Official JSON and Desktop SQLite JSON tables share the pure `desktopToMobileState` adapter. The exact main879 payroll snapshot validator runs on untouched canonical source fields when openings are present, before legacy defaults are projected, so missing/forged noncash fields cannot be repaired into acceptance. Canonical payroll and employee IDs, direction/anchor fields, source timestamps, whole original backup, audit before/after snapshots and financial movements survive. Native phone numeric record IDs remain unchanged; canonical IDs use the existing explicit aliases.

New converted imports are identified as `desktopImportVersion:879`. An ordinary existing phone boot does not rewrite source metadata. New native opening documents preserve mandatory status/date/time fields without legacy fallbacks, and reject contradictory status/voided or cash aliases. Legacy payroll defaults are unchanged. Feature schema remains4. Import/merge never replays cash, stock or payroll postings. Duplicate imports retain accepted native aliases and do not duplicate documents/audits. Different snapshots of the same worker or payroll document reject instead of silently combining conflicting wages.

This is compatibility of financial meaning and explicit import/export identity. It does not establish a shared database file, a bidirectional synchronization protocol or multi-device conflict resolution.

## Read authority and report source navigation

Generic worker records, including openings, remain private to `employees.view` in lists, direct reads and source workspaces. The main879 history API deliberately retains its preexisting reports lookup exception for linked ordinary and older payroll sources. Employee openings always require `employees.view`, including the report lookup path.

Phone report tables therefore emit a separate `site:feature:report-document:<id>` action. It is valid only for a displayed authorized report dataset or metric source and its current actor/view/modal. Opening it creates an in-memory grant for that one document, history and exports. It does not grant the corresponding workspace or edit/cancel rights, and it is cleared when leaving the document or changing actor. Source/edit/cancel controls without the corresponding capability are omitted with the original markup/style unchanged. Opening mutations continue to require `employees.manage`; worker cash mutations require `employees.pay`.

## Evidence

- `scripts/test-shared-contract-879.mjs`:8 checks (including133 official-source and119 native delete/wrong-type differential mutations,5 accepted optional-metadata variants and7 contradictory alias/noncash checks); pinned source validation, exact source preservation, malformed audit/anchor/cash rejection, repeat merge, idempotent upgrade and actual SQLite table parsing.
- `scripts/test-reports-parity-879.mjs`:8 checks; pinned payroll/ledger calculations and actual `app/api/history/route.ts` execution, noncash finance, period sources, AR/FR numeric PDF/XLSX models, read-grant revocation and mutation authority.
- `scripts/test-report-source-879-ux.mjs`:2 real-browser cases; Arabic360px/dark and French393px/light, persisted test users, report-only/source-read/manage capabilities, real XLSX output, no financial writes, no invoice overflow or script errors. Screenshots: `outputs/desktop879-qa/report-opening-{ar,fr}.png`.

Previous Desktop862/870 import, merge, identity, boundaries, report and shared-contract suites remain active. The old870 report UI selector now targets the explicitly scoped report-source action rather than a generic invoice action; its financial and privacy assertions are preserved.
