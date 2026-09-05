# Contamobile

Android-first mobile edition of the existing desktop accounting/shop-management application.

## Current stage
**Stage 0 — mobile engineering preparation.**

The desktop source has intentionally **not** been copied yet. This repository is first being prepared with project-specific agent instructions and reusable skills so future migration work follows one consistent mobile architecture and quality bar.

## Non-negotiable product goals
- Native-feeling phone UX rather than a compressed desktop interface.
- Preserve desktop business/accounting behavior unless an intentional change is documented.
- Fully useful offline with no required server or internet connection.
- Durable local SQLite storage with safe migrations and backup/restore.
- Arabic RTL as a first-class layout.
- French LTR support without duplicating the application.
- Android-first interaction and testing.

## Agent guidance
Read `AGENTS.md` first. Specialized workflows live under `.agents/skills/`.

## Next stage
After the original source repository is selected for import:
1. inspect architecture and dependencies;
2. inventory all features and business rules;
3. create a mobile parity ledger;
4. identify reusable domain logic;
5. establish the Expo/React Native shell;
6. migrate one complete feature vertically before scaling the migration.
