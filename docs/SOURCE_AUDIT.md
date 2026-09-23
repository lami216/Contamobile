# Desktop source audit

Audited repository: `https://github.com/lami216/offline-conta`.
Audit refreshed: 2026-09-23 against `main`, including source commits through 2026-09-20.

## Architecture found

- Next.js 16 + React 19 presentation.
- Electron 37 desktop shell.
- `better-sqlite3` local persistence with WAL and ordered migrations.
- Business command boundary in `app/api/command/route.ts`.
- Shared domain contracts in `app/domain.ts`.
- Reporting and operational read models under `lib/` and the application bootstrap.
- Arabic/French catalog under `app/i18n/`.
- Explicit capability/permission matrix in `app/user-permissions.ts`.
- Broad regression suite covering business rules, lifecycle revisions, history, inventory, parties, banks, reports, backup/restore, printing, i18n and security.

## Material source changes after the first mobile baseline

The refresh examined the desktop changes added after the 2026-09-05 mobile baseline. The relevant behavior falls into these groups:

### Accounting integrity
- authoritative opening-stock provenance and purchase-cost fallback;
- preservation of historical cost-at-sale during revisions;
- full-paid-or-full-credit invoice settlement rules;
- stale/archived party reference guards;
- inventory/settlement/restore hardening.

### Reversible transaction lifecycle
- centralized document read/lifecycle behavior;
- edit/void permissions and reversal metadata;
- reversible bank/account transfer and adjustment documents;
- historical identity preservation for archived parties, accounts and warehouses;
- effective-data reporting that excludes reversed lifecycle rows without deleting audit history.

### Catalog and reporting
- product categories with persistence, rename/delete safety and sale/purchase/report filters;
- strict report date validation;
- quantity-versus-money display separation;
- direct navigation from summaries/report rows to their source;
- read-only product detail;
- large-history report/bank performance work in the desktop implementation.

### Parties and permissions
- balance-safe party archive/restore;
- archived party history visibility;
- permission prerequisite normalization so edit/delete capabilities retain the required workspace visibility;
- safeguards against user-management lockout.

### Printing and branding
- configurable A4, thermal 80 mm and thermal 58 mm invoice profiles;
- invoice print preview improvements;
- store logo plus expanded contact details;
- desktop-local printer device selection and Electron silent-print integration.

## Mobile adaptation decisions

### Reuse by behavior / port as pure logic
`domain.ts`, party-balance semantics, sale/purchase settlement rules, authoritative cost rules, lifecycle reversal rules, report filter semantics, permission identifiers/dependencies and archive safety.

### Rewrite against Expo SQLite
Desktop SQLite wrappers, command persistence, lifecycle storage, backup/import integration and query/read models are implemented using `expo-sqlite` with mobile-owned schema/migrations.

### Native-mobile equivalents
- Electron printer selection/silent printing → Android native print dialog through Expo Print.
- A4/80 mm/58 mm CSS profiles → profile-aware mobile HTML/PDF page geometry.
- Desktop invoice logo file handling → bounded base64 image stored with invoice branding, so it survives local backup/restore and can render in Expo Print.
- Desktop source-navigation requests → Expo Router deep links into exact Records/Product/Party mobile surfaces.
- Desktop product read-only page → focused mobile read-only detail surface with edit as a secondary capability.
- Desktop wide workspaces/tables → searchable FlatLists, focused detail, sheets and sticky actions.

### Intentionally not copied
Electron process/window/close flow, Windows build/package logic, DOM portals/lightboxes, hover/right-click behavior, browser-only CSS mechanics and desktop printer-device binding.

## Traceability

The desktop repository remains the authoritative regression reference for accounting meaning. `docs/MOBILE_PARITY.md` records which capabilities are implemented, which platform-specific behavior is intentionally adapted, and which items still require real Android/device acceptance before release.
