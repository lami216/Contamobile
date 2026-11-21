# Employee payroll parity — Offline build 862

Source: `offline-conta@bdcdf2dba16d09489da9d7ee7942a7eb5ab7f2a0`, `lib/payroll.ts` and `lib/employee-ledger.ts`. The source calendar, validation, command and recognition logic is transpiled into `approved-runtime/payroll-domain.js`; its in-memory collection adapter operates on a cloned approved-phone state. It does not open a database, call a server or report durable success.

## Phone interaction

Employees open from More, using the existing navigation and section colors. A bounded directory shows name, status and signed debt (50 employees per page). A separate account contains its agreement, current balance, earned/recognized/reserved wages and a bounded transaction register. The current phone's statement export is available through `employee-statement` when both the employee and report permissions allow it.

The frequent movement sheet has direction and amount on one row, account and date on another, then an optional note. Inputs use the decimal/tel/date keyboard contracts and select-on-focus hook. Profile edits, future agreement edits, explicit resume and salary correction are separate focused sheets. Archive and cancellation require a deliberate confirmation; corrections and cancellations require the source's revision and reason.

Source navigation locates and highlights a row in the employee account without opening an editor. Opening that row shows the existing document detail with Edit; opening a different page or returning from the detail clears the temporary highlight. Read-only report users cannot acquire employee access through history details or PDF/XLSX shortcuts.

## Integration and storage contract

- `ensurePayrollState` adds only missing `employees`, `payrollFinancialMovements` and `auditEvents` arrays.
- `commandPayroll(state, action, input, {actor, now, idempotencyKey?})` and `materializePayroll(state, options)` return a new `state`. Neither mutates the supplied state. The application stages it and performs its one existing atomic save.
- `payrollFacts` computes recognized signed wages using the full history before period/employee selection. `entries` map canonical sources back to native numeric record ids, including recognition caused by an accrual after an advance. `employeeLedger` carries full running balances into a filtered period.
- Employee/agreement/period ids remain canonical strings. Native `records.id` remains numeric; `payrollDocumentId` preserves canonical identity. Payroll financial movement `documentId` refers to that canonical identity. Native `account` is numeric and canonical `paymentMethod` is its string representation.
- `validatePayrollState` validates the full canonical source ledger and its financial proofs, as well as native status/date/amount/account aliases. It rejects missing active financial proofs, duplicate ids, balance drift, invalid agreements, mismatched allocations and altered aliases before restore/save.
- Account projection never writes synthetic desktop ids/flags back into phone cards. Salary operations preserve existing sub-cent cash and leave untouched archive metadata untouched.
- The UI plugin only stages mutations. `afterSave` clears drafts and announces success; `afterFailure` clears staged feedback while retaining the attempted input. It has no independent persistence path.
- `employees.manage` and `employees.pay` remain separate; each depends on `employees.view`. `records.view` does not grant employee access.

## Verified evidence

`node --no-warnings scripts/test-payroll-parity-862.mjs`: **27 / 27 passed**. The immutable sibling Desktop source was present for this run. Its actual TypeScript pure calendar, summaries, ledger and restore validators were executed against the same fixtures after command mutations; source file SHA-256 values are pinned in the test. CI without that checkout still runs all stored golden cases and reports `golden-cases-only` explicitly.

The cases cover UTC dates, anchored month ends and leap years, future agreements, exact cents with pre-existing sub-cent cash, oldest legacy allocations, explicit advances/deposits, signed wage refunds, recognition from an accrual source, revision guards, archived cash accounts, resume gaps, serialization, tampering and independent capabilities. Component tests include invalid-input retention, delayed success and 120 employees with a 50-row display bound.

`scripts/test-business-workspaces-862.mjs`: **7 / 7 passed** in real bundled Chromium against the integrated approved runtime. Its salary example earns 500 and withdraws 200, producing wage expense 200, reserve 300 and cash 800 from 1000. It verifies reload, revision, cancellation, actual IndexedDB write failure/rollback/retry, source navigation, employee privacy (including direct history/PDF/XLSX), customer/supplier opening corrections, and expense-category draft/reclassification/archive flows.

The visual matrix covers Arabic and French, 360 and 393 widths, and light/dark appearances. Eight settled-animation screenshots and the machine-readable result are in `outputs/desktop862-qa/`. The date-cell fit, page horizontal overflow, sheet bounds and number keyboard mode are asserted. Arabic 360 dark ledger, French 360 light ledger and French 393 dark payment screenshots were inspected visually; they use the existing opaque sheets, neutral dividers, concise labels and restrained warm frames.

This evidence does not claim physical-device keyboard behavior or an Android APK upgrade/signature test. Those remain application release gates owned by the parent integration.
