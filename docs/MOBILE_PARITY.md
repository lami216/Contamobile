# Contamobile parity ledger

Source of truth: `lami216/offline-conta` (`main`). Last source/command audit: 2026-09-23, covering desktop changes through 2026-09-20.

Legend:
- ✅ implemented and included in the mobile quality gate
- 🟡 implemented but still needs real-device / real-data acceptance testing
- ⬜ intentionally pending

## Feature parity

| Desktop capability | Mobile destination | Status | Notes |
|---|---|---:|---|
| Point of sale | Sales → New sale | ✅ | retail/wholesale, direct paid/credit sale, full-paid-or-full-credit settlement policy, stock guard, expiry guard, low-stock feedback |
| Sale edit / void | Records → Sale | ✅ | reverses prior stock/debt/payment effect atomically before applying the revision |
| Purchase invoices | Sales → Purchases | ✅ | stock increase, supplier debt, authoritative purchase cost and full-paid-or-full-credit settlement |
| Purchase edit / void | Records → Purchase | ✅ | safe reversal; blocks impossible reversal when purchased stock was already consumed |
| Expense invoices | Sales → Expenses | ✅ | payment-account outflow, edit and void reversal |
| Invoice / transaction history | Sales → Records | ✅ | search/type/date/all-time filters, exact source deep links, detail, lifecycle edit/void, print and PDF share |
| Products | Inventory → Products | ✅ | categories, SKU/barcode, prices, expiry, notes, authoritative opening-stock cost, archive/restore and read-only detail for view-only users |
| Product categories | Inventory → Products | ✅ | create/rename/delete, product assignment and sale/purchase/report filtering |
| Warehouse admin | Inventory → Warehouses | ✅ | create/rename/default/safe archive rules |
| Inventory view | Inventory → Stock | ✅ | per-warehouse quantity/value and search |
| Warehouse transfer lifecycle | Inventory → Transfer / Records | ✅ | atomic stock out/in plus historical-safe edit/void |
| Stock adjustment lifecycle | Inventory → Adjustment / Records | ✅ | counted quantity + reason + authoritative-cost guard plus historical-safe edit/void |
| Customers | Parties → Customers | ✅ | search, balances, metrics, create/edit, balance-safe archive and archived restore |
| Suppliers | Parties → Suppliers | ✅ | search, balances, metrics, create/edit, balance-safe archive and archived restore |
| Party cash operations | Party detail / Records | ✅ | receive/pay with payment-account movement, party-balance snapshot and lifecycle void |
| Party ledger | Party detail / Reports | ✅ | date filtering, party metrics, settlement/offset support and source-document drill-down |
| Payment accounts | More → Accounts | ✅ | seeded/custom accounts, edit/color/active state/archive/restore |
| Account movements | More → Accounts → Movements | ✅ | date/account/type filters and signed in/out display |
| Account transfer | More → Accounts → Transfers / Records | ✅ | reversible lifecycle document, historical references and atomic out/in |
| Deposit / withdraw | More → Accounts → Retrait / dépôt / Records | ✅ | reversible lifecycle document with date/account/type history filters |
| Opening balance correction | More → Accounts | ✅ | delta-only correction with required reason and before/after audit fields |
| Reports | More → Reports | ✅ | overview, sales, purchases, product sales, stock, debts, party ledger, finance and expenses with date/category/product/account filters and source drill-down |
| Users & permissions | More → Settings | ✅ | local users, password hashing, owner protection, dependency-normalized presets/custom permissions, lifecycle and archive capabilities |
| Permission-aware navigation | Tabs / hubs / dashboard | ✅ | unauthorized tabs/actions/metrics are hidden while route-level/action checks remain enforced |
| Branding | More → Settings → Business identity | ✅ | store logo, name, phones, address, registration/tax/footer and invoice-name styling |
| Invoice paper profiles | Settings → Format de facture | 🟡 | A4, thermal 80 mm and thermal 58 mm profiles ported; Android uses the native system printer chooser instead of desktop printer binding |
| PDF document output | Records → Share PDF | 🟡 | Arabic/French RTL/LTR output, branding logo and saved paper profile; final printer/device visual acceptance remains |
| Direct mobile printing | Records → Print | 🟡 | Expo/native Android print dialog with the selected A4/thermal profile; real thermal-printer acceptance remains |
| Backup / restore | More → Settings → Data | 🟡 | full local JSON export/restore plus pre-restore safety copy; archived/lifecycle/category/settings data are preserved |
| Official desktop backup import | More → Settings → Data | 🟡 | official backup converter, invariant validation, preview and safety backup; current import keeps newer archived/category/accounting state |
| Arabic / French | Settings → Language | 🟡 | RTL/LTR architecture and primary operational surfaces are bilingual; final full-app copy/device sweep remains |
| Android application identity | Expo config | ✅ | `mr.alkarna.mobile`, project icon, adaptive icon and Android-first configuration |
| Android build profiles | `eas.json` | ✅ | preview APK and production AAB profiles configured |
| Mobile activation / licensing | Approved Android startup / Settings | 🟡 | Native offline gate implements desktop V1/V2 signed-file contract and public keys; actual issuer executable acceptance remains pending. See OFFLINE_ACTIVATION.md. |

## 2026-09 source refresh

The desktop source was re-read after the original mobile baseline. Mobile now carries the material cross-platform changes added after that baseline:

- product categories and category-aware sale/purchase/report filtering;
- authoritative opening-stock and purchase-cost rules;
- full-paid-or-full-credit invoice settlement semantics;
- archived-party lifecycle and historical identity preservation;
- permission dependency normalization and lifecycle capabilities;
- reversible account transfers, account adjustments, stock transfers and stock adjustments;
- exact source navigation from report rows into records, products and parties;
- dedicated read-only product detail before editing;
- invoice logo/contact parity;
- A4 / thermal 80 / thermal 58 invoice formats adapted to Android printing.

Desktop-only implementation details such as Electron printer-device binding, Windows packaging, DOM lightboxes, hover behavior and desktop window lifecycle are intentionally not copied. Their user-facing capability is mapped to native Android equivalents instead.

## Desktop command coverage audit

The current desktop command surface was re-audited against the source behavior rather than copied route-for-route. Mobile user-facing flows cover products/categories, warehouses, sales, purchases, stock transfer/adjustment, party cash, expense revisions, payment-account management, account transfer/adjustment/opening-balance correction and party lifecycle operations.

`payment.post` remains a legacy backend path rather than a second mobile payment workflow. Mobile keeps the active party-cash flow to avoid duplicate accounting entry points.

Legacy `return` records remain read-only historical data. They are not offered as a new-operation type on mobile.

## Non-negotiable source invariants preserved

- Party net is `receivable - payable`; receiving cash decreases net and paying cash increases it independent of customer/supplier role.
- New sale/purchase invoices are either fully paid or fully credit; later settlement is recorded from the party account.
- Sales cannot create negative stock and cannot sell expired products.
- Sales preserve cost-at-sale and gross profit from authoritative purchase cost.
- Purchases increase stock and update authoritative last-purchase cost.
- Opening-stock provenance remains distinct from later stock adjustments.
- Edits and voids reverse prior stock/debt/payment effects atomically and retain revision/audit history.
- Archived parties/accounts remain valid historical identities and cannot be destructively removed while financially unsafe.
- Warehouse deletion cannot remove a default warehouse, a warehouse with stock, or historical identity.
- Payment-account deletion requires zero balance; referenced accounts are archived instead of erasing financial history.
- Money is stored as integer MRU; quantity may be decimal and is never formatted as money.
- Historical documents, product identity and financial movements are retained instead of being cosmetically deleted.

## Release acceptance still required before activation

1. GitHub quality gate must remain green: typecheck, ESLint, tests and real Expo Android bundle export.
2. Install a preview APK on at least one Android device and execute a scripted smoke test covering sale, purchase, debt, stock transfer/edit/void, expense, account movement, party archive/restore, backup/restore and language switching.
3. Import at least one representative official desktop backup and reconcile stock, receivable/payable, account balances, document counts and representative invoices.
4. Visually inspect Arabic and French A4, thermal 80 mm and thermal 58 mm output on Android, including logo and one real share/print target.
5. Run the final Arabic/French copy, RTL/LTR, small-screen and large-font sweep.
6. Only after the above, implement the mobile activation/licensing system and its offline activation-file workflow.

## Approved runtime party summaries — 2026-10-18

The approved Android runtime and standalone preview now share the desktop customer/supplier historical trade, cash and gross-profit/purchase-count summaries, separate current debt directions and bounded metric source lists. Aggregate scope is every active account of the selected type across all time; search does not change the totals. See PARTY_SUMMARIES.md for the source trace, sign mapping and evidence.

## Approved APK feature-gap audit — 2026-10-19

**Scope correction:** the older feature table above describes the legacy React Native implementation. Its completed statuses must not be used to claim parity for the approved embedded-web APK. This audit compares desktop `lami216/offline-conta` at `1b4951947a82ca9da21337c757fe7afdd2329403` with the actual 1.0.11 APK sources at `ff82a0e0e709ac5bed7d5f4118147ede900fd76c` (`approved-runtime` and `approved-android`). No application behavior was changed during this audit.

Evidence: 41 desktop source/test files inspected; 11 current-runtime screens/dialogs opened in an isolated browser; six export-scope probes. Local evidence is in `outputs/desktop-parity-audit/findings.json`, with `work/audit-desktop-parity.cjs` as the repeatable probe. This is a capability audit, not a claim that every accounting edge case has been tested against the desktop engine.

| Capability | Approved-runtime assessment | Desktop source / current evidence |
|---|---|---|
| Currency selection / additional saved currency codes | Missing. MRU is hardcoded in amount rendering and outputs. Desktop changes display currency; it does not exchange or convert stored balances. | `lib/currency-core.ts`, `lib/currency-settings.ts`, GeneralSettings; mobile `engine.js` money formatter, `app.js` outputs |
| Product-category create/rename/delete and assignment/filtering | Missing in the approved product model/editor and pickers. | `app/product-category-dialog.tsx`, ProductForm, ProductSearchPicker; mobile product-editor fields |
| Per-user, per-screen view/create/edit/delete permissions | Partial. Enforcement and presets exist; the approved editor exposes preset roles only and overwrites capabilities with the role preset when saving. | UsersPermissions, `lib/permission-dependencies.ts`; mobile `saveUser` and new-user fields |
| Invoice branding | Partial. Store name, phone, address and footer exist; custom invoice logo, registration/tax numbers and name typography controls are absent. The fixed app logo is a different feature. | `lib/invoice-branding.ts`, GeneralSettings; mobile branding screen has four fields |
| Saved A4 / thermal80 / thermal58 output profiles | Missing from approved settings; native printing starts with ISO_A4. Generic Android printing already exists. | `app/printing.ts`, PrintSettingsPanel; native MainActivity `printDocument` |
| Report product/category/payment-account/direction/debt-side filters | Partial. Report types and date range exist; the approved report toolbar only exposes report and period. | Reports, `app/report-types.ts`; current report screen probes |
| Report-specific XLSX/PDF/print data | Defect / incomplete. `exportRecords()` ignores reportType and emits the generic period-filtered record register. In a sale/purchase/expense fixture, all six tested report types export all three kinds. Stock/debt/party reports need their own report model, not record rows. | Desktop Reports `printReport`; mobile `app.js` exportRecords/exportExcel/exportPdf/printRecords; six executable probes |
| Party ledger inside Reports | Partial. Party pages have operation histories; the report named party-ledger currently shows party balances, not a selected party's dated opening/movement/closing ledger. | Desktop Reports party filters and `lib/reports.ts`; mobile `reportDetails` party-ledger branch |
| Individual document output | Partial. Individual invoice supports print/system Save as PDF. The desktop three-choice document XLSX/direct-PDF/printer output is not implemented as three separate actions on the approved individual invoice. Register export already has three choices. | Desktop DocumentDetail/OutputChoiceDialog; mobile `invoice-view.js` document-actions |
| Multi-product stock transfer / stock correction | Missing. Approved editor and reviewStock produce one product line per operation. | Desktop MultiStockForm/StockDraftTable; approved utility-form fields and reviewStock |
| Opening-stock provenance and dedicated correction controls | Partial. Creation posts opening stock and preserves a readonly opening quantity on product edit. Desktop also replays consumed/remaining/transferred opening allocations and supports controlled opening quantity/cost/location correction/history. | `lib/opening-stock.ts`, ProductForm, `app/opening-stock-history.tsx`; approved productOpening/product editor |
| Warehouse default-for-sale and safe archive/delete | Partial. Create/rename/select exist; dedicated persistent sales-default and archive/delete workflows are absent. | Desktop WarehouseAdmin; approved warehouse administration actions |
| Customer/supplier safe archive and restore | Missing. Approved product/payment-account archives exist, but party archive/restore does not. | Desktop Parties/PartyEditDialog; approved site-archived only includes products/accounts |
| Payment-account activation and opening-balance correction history | Partial. Name/current-balance correction/archive exist. Active/inactive toggle and the desktop dedicated opening-balance correction workflow/history are absent; approved current-balance correction is a deposit/withdraw record. | PaymentAccountDialog; approved site-account-edit and site-account-adjust |
| Independent document sequences per sale/purchase/expense | Missing for newly created approved records. They share a global numeric ID counter and kind-ID display. | `lib/document-sequences.ts`; approved newRecord |
| Expense backdating | Missing from approved expense editor (name/account/amount/note only). Desktop has a separately validated expense date. | Desktop Expenses; approved expense-editor probe |
| Expense / stock-operation drafts and dirty-editor guards | Partial. Sale/purchase draft persistence exists; stock and expense editors do not carry the desktop draft/leave-protection workflows. | Desktop Expenses, MultiStockForm, stock-operation-draft; approved savePosDraft only |
| Advanced legacy import and merge | Partial. Approved JSON backup preview/replace/safety-copy exists. Desktop additionally accepts SQLite/DB sources and supports matching/conflicts, stock/account policies, chunked/progress-tracked import runs and merge. | Desktop DataSettings, legacy/import-run.ts, migration/preview.ts; approved reviewImport/desktopToState |
| Backup reminder before exit | Desktop capability requiring Android-specific adaptation; absent from native Back/exit behavior. Manual backup exists. This is a prompt, not automatic scheduled backup. | `desktop/close-flow.cjs`; native MainActivity onBackPressed |

Intentionally changed by the user: wholesale pricing, customer/supplier offset workflow, generic document-resource tabs, and redundant invoice-creation/recent-invoice controls. Do not reintroduce them as parity fixes.

Confirmed present, not gaps: Arabic/French RTL/LTR, dark/light, barcode scanning, expiration checks, all four party receive/pay directions, transient source location/highlight, per-number source drilldowns, customer/supplier aggregate/account summaries, product and payment-account archives, manual backup/restore, preset user roles, bounded lists/paging and sortable table headers. The missing report filters above do not mean that sorting is absent globally.

Suggested priority: correct report output scope and complete party-ledger reporting; then currency/categories/granular permissions; then stock/opening and administration gaps; then printing/branding and advanced import/draft conveniences. These are audit findings and proposed work order, not implemented changes or a new APK release.


## Approved runtime feature release 1.0.12

The 2026-10-19 gap audit is now implemented in the approved runtime. See [APPROVED_FEATURES.md](APPROVED_FEATURES.md) for contracts, deliberate exclusions, import limitations and preservation gates. Production delivery requires the signed Android workflow to pass; the old React Native checklist is not release evidence.
