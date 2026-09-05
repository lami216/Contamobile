# Desktop source audit

Audited repository: `https://github.com/lami216/offline-conta`.

## Architecture found

- Next.js 16 + React 19 presentation.
- Electron 37 desktop shell.
- `better-sqlite3` local persistence with WAL and migrations.
- Business command boundary in `app/api/command/route.ts`.
- Shared domain contracts in `app/domain.ts`.
- Reporting logic in `lib/reports.ts`.
- Arabic/French catalog under `app/i18n/`.
- Explicit capability/permission matrix in `app/user-permissions.ts`.
- Broad regression suite covering business rules, history, inventory, parties, banks, reports, backup/restore, i18n and security.

## Migration classification

### Reuse by behavior / port as pure logic
`domain.ts`, `party-balance.ts`, `sale-draft.ts`, report calculations, document sequencing, filter semantics and permission identifiers.

### Rewrite against Expo SQLite
`lib/sqlite.ts`, command persistence, backup filesystem integration, authentication storage.

### Replace entirely
Electron process/window/close flow, Next API routes, DOM portals, CSS, hover behavior, print-window mechanics.

### Preserve for traceability
The original repository remains unchanged and is the authoritative regression reference until every row in `MOBILE_PARITY.md` is verified.
