---
name: mobile-quality
description: Audit and verify Contamobile mobile quality. Use for accessibility, performance, forms, large lists, regression testing, edge cases, visual QA, Android device behavior, and release-readiness checks.
metadata:
  project: Contamobile
  version: "1.0"
---

# Mobile Quality Gate

## Accessibility
Review every interactive screen for:
- semantic accessibility roles and labels where visual context is insufficient;
- readable text and support for larger font sizes;
- adequate contrast;
- focus/reading order that follows the visual task flow;
- state not conveyed by color alone;
- >=44x44 touch targets for important controls where practical;
- labels associated clearly with form fields;
- actionable error messages.

## Performance
Check real data scale, not demo scale:
- large inventory;
- long customer/vendor history;
- hundreds/thousands of transactions;
- repeated searches and filters;
- expensive dashboard totals.

Use virtualized lists, bounded queries, database aggregation, and careful state ownership. Avoid premature memoization; fix measured bottlenecks.

## Data-loss resistance
For create/edit/payment/sale flows:
- prevent accidental double-submit;
- clarify destructive actions;
- preserve drafts where interruption would be costly when feasible;
- never show success before durable write completion;
- handle failed writes and transaction rollback visibly.

## Android device matrix
At minimum verify important flows on:
- a small/narrow phone viewport;
- a typical mid-size Android viewport;
- large font/display scaling;
- keyboard open;
- Arabic RTL;
- French LTR;
- app cold start after existing data;
- offline/airplane mode.

## State matrix
Every data-driven screen needs intentional behavior for:
- first load;
- empty data;
- populated data;
- loading/refresh when applicable;
- validation error;
- persistence failure;
- no search matches;
- disabled/unavailable action.

## Visual QA
Look for:
- inconsistent spacing/radii/type styles;
- text clipping;
- misaligned numbers;
- RTL-only defects;
- content under status/navigation bars;
- keyboard covering submit controls;
- excessive visual density;
- icons without understandable labels;
- inconsistent destructive-action styling.

## Testing priorities
Highest-value automated tests target:
1. accounting/domain calculations;
2. SQLite migrations and transaction integrity;
3. validation and formatting utilities;
4. critical stateful workflows;
5. regressions found during migration.

Avoid fragile tests that only reproduce implementation details.

## Release gate
Do not call a feature complete if:
- TypeScript or lint fails;
- known critical data-integrity bug exists;
- RTL breaks the task;
- the main action is inaccessible behind the keyboard;
- large realistic data makes the screen unusable;
- a failed write can look successful;
- feature parity has not been checked against the desktop source where parity is required.
