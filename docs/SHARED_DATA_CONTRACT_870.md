# Desktop 870 interoperability boundary

Reference: Offline Conta build **870**, commit `e4cbe46fd59e302140e6d885c69ca98376d4a00d`.

The current Android runtime preserves the Desktop business contract through an explicit adapter. It does **not** yet open the same physical database, synchronize devices, or export current Mobile state as a Desktop database. This distinction is essential before a future common database is enabled.

## Identity and retained source evidence

- Desktop uses string identities for products, parties, warehouses, payment accounts and documents. Mobile keeps its existing numeric local identities and warehouse-name stock keys so an installed application's references remain valid.
- Imported entities and documents now carry additive `canonicalId` values equal to the source identity. Existing `desktopId`, `desktop`, `desktopMappings`, raw `desktopOriginal` and merged `desktopImportSources` remain retained. Legacy native rows are not assigned random identities during a read, upgrade or backup.
- Canonical employee IDs and payroll document IDs remain strings, including `deletionDocumentId`, `payrollDocumentId`, financial movement references and audit snapshots. Mobile record IDs may be remapped while those canonical references remain unchanged.
- `originId` remains the existing native identity or Desktop snapshot fingerprint. A snapshot fingerprint must not be interpreted as a stable organization ID.
- Raw source backups preserve historical proof, not a replacement for exporting the current state after further Mobile transactions.

## Additive feature schema 4

Schema 4 retains all schema 2/3 financial state and adds `counters` and stock settlement display metadata. The application takes a pre-upgrade recovery snapshot before the additive migration. If a v35 import has no native `counters` array, the migration recovers retained high-water marks from `desktopOriginal` and prior merged source backups. Known Mongo extended numeric scalars are decoded while unrelated counter metadata stays opaque; existing native counters are not replaced. `upgradeState` normalizes native records in numeric ID creation order; imported record IDs preserve the source collection's insertion order. It does not reorder financial history or replace existing local IDs.

The native JSON backup remains `alkarna-web-backup`. The official Desktop JSON and SQLite adapters retain the same source collections, including counters, payroll/audits, account transfers, recurring definitions and import mappings. Source users remain raw backup evidence; they do not replace Mobile login credentials or activation.

## Employee account invariants

- Profile corrections retain `accountStartDate`, canonical payment identities/dates, accrual snapshots, schedule rebasing proof and the deletion audit.
- A deleted employee remains a retained, archived employee record with zero balance. A positive outstanding balance closes through `employee-closure`, never a fabricated cash payment or physical removal of its history.
- The closure is posted, revision zero, has no lines or payment method, and has zero `cashAmount`, `paidTotal` and `dueTotal`. Its positive total, negative balance delta and `salaryReserveReleased` must match the employee ledger and deletion audit before/after snapshots.
- Missing, unknown, contradictory or tampered closure evidence rejects the complete import. Validation and conversion are pure and cannot partially change the installed state.
- Merging a new deleted employee counts that retained employee once. Reimport is idempotent. Two differing snapshots of the same employee ledger require full restoration instead of silently combining wages or payments.

## Stock settlement display contract

- The canonical counter row is `_id: "documentSequence:stock-settlement"`; its Mobile mirror is `sequences["stock-settlement"]`.
- `settlementSequence` is a display number, never a document ID. Opening stock, opening corrections and archive-clearance documents remain outside the ordinary settlement sequence.
- Preserve accepted unique numbers, including cancelled documents. Allocate missing, invalid or duplicate values strictly above the retained high-water mark; never recycle cancellation gaps.
- Keep current accepted aliases when a matching source document is replaced during merge. Resolve cross-source collisions before sorting the presentation list, so reimport cannot steal a previously committed number.
- Original `number`, canonical/local document IDs, movement `documentNumber`, revisions, dates, balances and line values remain unchanged by normalization. Unrelated counter rows remain opaque retained metadata.

## Future common database work still required

Before Desktop and Mobile can safely share one database, introduce a versioned common DTO/storage boundary for every native entity, a stable organization ID, warehouse/account references by canonical ID, reverse serialization of **current** Mobile operations, and shared transaction/idempotency/revision rules. A persisted command receipt and atomic reservation must cover each financial change. Existing Desktop commands and validators should remain the authority for business rules.

That work must migrate existing numeric/native identities through explicit retained mappings; replacing them or replaying balances from backup is unsafe. It also needs concurrent-writer conflict tests and organization isolation tests. None of that synchronization is implied by this update.

## Verification

`node scripts/test-shared-contract-870.mjs` loads the exact pinned Desktop payroll implementation, checks its source hash, validates a genuine canonical closure fixture and compares its accepted representation with Mobile. It also tests forged evidence, noncash/opening invariance, cancelled/gapped counters, creation-order backfill, repeat imports, deleted-staff merge counts, cross-source alias collisions, native JSON restoration and official SQLite collection retention.

The SQLite collection test isolates the adapter's SQL selection/serialization boundary; it does not replace independent testing of the SQLite parser or Android upgrade installation.

Legacy regressions retained: `test-desktop-import-parity-862.mjs` (10 groups), `test-862-import-merge.mjs` (11 groups), and `verify-feature-domains.mjs` (15 checks). The 870 source is selected only through `DESKTOP_870_ROOT` / `DESKTOP_870_SOURCE`; tests pinned to 862 keep their separate reference.
