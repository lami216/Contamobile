# Approved runtime 1.0.12

The production application remains the approved Arabic/French WebView runtime. This release extends it additively; it does not replace the approved screens with the historical React Native scaffold.

## Reports and documents

- Each report exports its own dataset and active period/filters. PDF and XLSX share that dataset. Spreadsheet amounts remain numeric.
- The party statement selects one customer or supplier and shows opening balance, signed movements, and closing balance. Supplier orientation and all four receive/pay combinations follow the desktop ledger contract.
- Product/category, warehouse, account, movement direction and debt filters appear where meaningful. Existing report source/reconciliation drilldowns remain available.
- Individual document PDF uses a document composition; its XLSX includes document details and lines. Reports export directly without a print dialog.

## Store management

- Saved currency codes change display only, never amounts or exchange rates.
- Product categories support create/rename/delete, assignment, inventory/POS filtering and report filtering. Removing a category preserves its products.
- Per-user permission matrix uses the desktop capability catalog and dependency rules. Owner protection and action checks remain enforced.
- Document identity supports a local logo, registration/tax numbers and merchant-name typography.
- Warehouses support a sales default, guarded archive and restore. Parties must have zero balance to archive. Payment methods support active/inactive state and audited opening-balance corrections.
- Sale, purchase and expense sequences are independent. Expense business dates are calendar-validated. Expense and stock workflows retain local drafts.

## Stock and import

- Transfers and adjustments accept several products and commit together after validation.
- Opening-stock provenance reuses the desktop replay/planning rules, including transfers, sales, edits and voids. Historical products lacking a complete pre-migration event history remain read-only for opening corrections rather than inventing provenance. Their current stock is still adjustable through audited stock corrections.
- JSON, official desktop SQLite and DataAcc DB imports stage an isolated candidate, display matches/conflicts and balance policies, retain a resumable preview, and save a complete safety backup before merging. Imported history does not silently post its effects twice. Repeated imports use stable source references.
- Unsupported source semantics, including offset documents, partial-payment models and unknown financial directions, are rejected or explicitly listed for review rather than silently converted. Source files and current data remain intact.
- Optional Android exit reminder offers a user-requested backup. There is no automatic promise of an external backup.

## Preservation and release gates

The package identity, IndexedDB name/origin, activation formats, consumed-license state and permanent signing certificate are unchanged. The migration preserves old business fields and keeps a pre-upgrade snapshot. CI builds the actual previous source revision `ff82a0e0e709ac5bed7d5f4118147ede900fd76c`, installs it, creates business data and activation, then installs the new APK with `adb install -r` and checks preservation.

Required checks include domain accounting, import policies/idempotence, source navigation, French/LTR output, historical totals, direct native exports and cold persistence. No demo-data button, wholesale pricing, offset UI, printer profiles or redundant creation actions are restored.

The opening-stock and permission domain ports are attributed to offline-conta `1b4951947a82ca9da21337c757fe7afdd2329403`. SQLite is parsed locally using sql.js 1.13.0; its MIT license is bundled. No network permission is added to the Android app.
