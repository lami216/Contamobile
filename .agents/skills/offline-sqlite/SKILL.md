---
name: offline-sqlite
description: Design, implement, migrate, and review Contamobile local persistence using SQLite with no required server or internet. Use for schema design, repositories, transactions, backups, restores, migrations, search, financial writes, and offline data integrity.
metadata:
  project: Contamobile
  version: "1.0"
---

# Offline-first SQLite for Contamobile

## Core rule
The installed app must remain fully useful without network access. Internet connectivity must never be a hidden requirement for core accounting workflows.

## Storage principles
- Use SQLite for durable relational business data.
- Use small key/value storage only for lightweight preferences or flags, not core accounting records.
- Keep SQL and persistence behind a repository/data-access layer; screens should not contain ad-hoc SQL.
- Use stable IDs and explicit timestamps.
- Store money in an exact representation appropriate to the desktop source rules; never introduce floating-point rounding errors casually.
- Preserve enough audit/history data to explain financial state when the desktop app does so.

## Schema workflow
Before creating tables, inspect the source app and document:
1. entities and identifiers;
2. relationships;
3. required/optional fields;
4. uniqueness rules;
5. cascade/delete behavior;
6. computed versus stored values;
7. financial invariants.

Do not rename concepts just to make the mobile schema look cleaner if that risks changing business meaning.

## Migrations
- Every schema change after first usable build must have a migration path.
- Never solve a schema change by deleting the database during normal app upgrades.
- Migrations should be deterministic, ordered, and idempotent where practical.
- Back up or validate critical data before destructive transformations.

## Transactions
Use transactions for operations that must succeed or fail together, such as a sale that changes invoice rows, payment/ledger state, and stock quantities. Never leave partial financial writes because one later statement failed.

## Queries
- Bind parameters; never build SQL from unsanitized user text.
- Index fields used for frequent lookup, foreign-key traversal, date filtering, or search after measuring real need.
- Query only columns/rows needed by the screen.
- Use pagination/limits for large histories.
- Prefer database aggregation for totals when loading all rows into JS would be wasteful.

## Search and filters
Accounting users often search by name, reference, date, status, debt, or amount. Design query APIs for composable filters instead of filtering a huge in-memory array.

## Backup and restore
A local-only application needs a deliberate escape hatch:
- export a backup file containing the data needed to restore the app;
- validate backup version/schema before restore;
- never overwrite current data silently;
- use a temporary/import validation stage before destructive replacement when feasible;
- explain clearly whether restore merges or replaces;
- test backup/restore with Arabic text and large datasets.

## App lifecycle
- Database initialization must be safe on repeated launches.
- Do not assume the app closes cleanly.
- Writes should survive process termination once committed.
- Handle low-storage/write failures visibly.

## Testing
For every critical write path test:
- normal case;
- validation failure;
- duplicate/retry where relevant;
- transaction rollback;
- large values and zero values;
- Arabic strings;
- app restart persistence;
- migration from previous schema version.

## Prohibited shortcuts
- No server requirement for local CRUD.
- No important state stored only in React memory.
- No destructive reset as a migration strategy.
- No unbounded `SELECT *` for screens with potentially large history.
- No silent database errors.
