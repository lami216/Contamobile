---
name: desktop-to-mobile-migration
description: Port features from the existing desktop Contamobile source into the Android app without losing business behavior. Use when importing source code, mapping desktop screens to mobile flows, reusing domain logic, replacing desktop/web APIs, or validating feature parity.
metadata:
  project: Contamobile
  version: "1.0"
---

# Desktop → Mobile Migration

## Rule zero
Do not translate screens pixel-for-pixel. Translate capabilities and workflows.

## For every desktop feature, build a migration record
Capture:
- feature name and source files;
- user goal;
- inputs and validation;
- business/domain logic;
- database reads/writes;
- side effects;
- permissions/roles if any;
- filters/search/sort;
- export/print behavior;
- error cases;
- mobile destination screen/flow;
- parity status.

## Classification
Separate source code into:
1. **domain logic** — calculations, validation, accounting rules; reuse or port carefully;
2. **data access** — adapt to the mobile SQLite layer;
3. **presentation state** — reuse concepts, not platform assumptions;
4. **desktop/web UI** — redesign for React Native;
5. **platform integrations** — replace filesystem/window/browser/desktop APIs with mobile equivalents.

## Web/Electron patterns that do not port directly
Expect to replace or redesign use of:
- DOM elements and CSS layout;
- browser localStorage/sessionStorage;
- Electron IPC/window/menu APIs;
- hover/right-click interactions;
- drag-heavy interactions;
- keyboard shortcuts as the only access path;
- desktop file paths;
- wide data tables;
- popup-window workflows.

Never simulate these badly on mobile merely to claim parity.

## Parity strategy
Prioritize by business criticality, not by source-file order:
1. startup/database integrity;
2. essential daily transaction flows;
3. inventory/debt/payment workflows;
4. search/history/reporting;
5. configuration/admin;
6. secondary convenience features.

A feature is only parity-complete when its important rules and edge cases work, not when a similarly named screen exists.

## Migration workflow
1. Read source implementation completely enough to understand behavior.
2. Write the migration record.
3. Extract tests or examples for business calculations before rewriting UI.
4. Define the phone interaction model.
5. Port/reuse domain logic.
6. implement mobile persistence.
7. implement native UI.
8. compare desktop vs mobile with the same sample data.
9. record intentional differences explicitly.

## Data migration
Do not assume the desktop database file can simply be opened on Android. First identify its engine, schema, versions, file format, and platform assumptions. If importing existing customer data is required, design a versioned import/export path and validate it against real sample databases before release.

## Feature ledger
Maintain `docs/MOBILE_PARITY.md` after source import. Each feature should be one of:
- not assessed;
- assessed;
- in progress;
- mobile complete;
- verified parity;
- intentionally changed (with reason).

## Prohibited behavior
- deleting a feature because the desktop UI does not fit;
- rewriting accounting formulas from memory;
- claiming parity from screenshots alone;
- coupling new mobile screens directly to legacy desktop UI code;
- changing stored financial meaning to simplify presentation.
