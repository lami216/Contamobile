# Ulysses Contract — Contamobile Mobile Product Rebuild

This document is the execution contract for the mobile-product rebuild. It exists to prevent the project from regressing into a feature-complete but slow, form-heavy, desktop-shaped phone app.

## Mission
Build **الكرنه** as a fast, premium, Android-first shop operations app that a seller can use repeatedly throughout the day with minimal thought, minimal taps, and minimal keyboard use while preserving the accounting behavior and offline integrity already implemented.

The app is not considered successful because every desktop feature has a mobile screen. It is successful only when the most common shop workflows feel deliberately designed for a phone.

## Non-negotiable product rules
1. **Task speed beats screen parity.** Preserve business behavior, not desktop interaction structure.
2. **Daily actions must be thumb-first.** Frequent actions belong in reachable, persistent locations.
3. **No long form is allowed for a high-frequency task when progressive disclosure, defaults, step flows, pickers, steppers, or bottom sheets can remove friction.**
4. **No repeated keyboard opening for quantities or common numeric actions when direct controls can do the job.**
5. **Critical totals and the next primary action stay visible.** Do not make the user scroll to discover the total or submit action in sale/payment flows.
6. **The default path serves the common case.** Rare settings and exceptions move behind secondary controls.
7. **One screen = one obvious job.** A screen must not feel like a dump of desktop fields.
8. **Every interaction must have feedback.** Pressed, loading, disabled, success, warning, error, and destructive states must be obvious.
9. **Premium means disciplined, not decorative.** Use hierarchy, spacing, typography, motion, elevation, icons, micro-feedback, and empty states to improve comprehension. Do not add effects that slow the seller.
10. **Accounting correctness is untouchable.** Existing domain, service, permission, SQLite, transaction, audit, and history invariants remain authoritative unless a verified defect requires change.
11. **Arabic RTL is a first-class layout.** French LTR must remain natural from the same component architecture.
12. **Offline operation remains complete.** No core workflow may acquire a server or internet dependency.
13. **Large real data must remain usable.** Use bounded queries, searchable lists, virtualized content, and progressive detail.
14. **No feature is complete because it compiles.** It must pass the workflow test below.

## Workflow test
Before marking a redesigned flow complete, answer all of the following:
- What is the user trying to finish?
- What is the fastest safe path for the common case?
- How many taps are required from the natural entry point?
- How many times must the keyboard open?
- Is the main action visible without precision tapping?
- Can the task be completed one-handed on a typical Android phone?
- Does the user always see the critical amount/status before confirming?
- Are risky actions harder to trigger than common safe actions?
- What happens with empty data, long names, large amounts, no results, validation errors, and failed persistence?
- Does Arabic RTL feel intentionally composed rather than mirrored accidentally?

If the answer exposes avoidable friction, the flow is not finished.

## POS-specific acceptance bar
The Point of Sale is the highest-priority workflow.

A seller should be able to:
- search or scan a product immediately;
- add a product with one obvious action;
- increase/decrease quantity without opening the keyboard for normal quantities;
- remove an item safely and quickly;
- see cart count and total continuously;
- switch retail/wholesale only when needed;
- attach a customer only when needed;
- complete the common paid sale with a short payment step;
- create a credit/partial-payment sale without losing context;
- receive clear warnings for stock, expiry, and below-cost conditions;
- start the next sale immediately after success.

The sale flow must not require scrolling to the bottom to discover the checkout action.

## Home-screen acceptance bar
The home screen is an operational cockpit, not a passive metric wall.

It should prioritize:
- the primary action to start selling;
- today's essential numbers;
- actionable attention items (low stock, due balances, relevant warnings where data supports them);
- recent operations that help the seller recover context quickly;
- role/permission-aware content.

## Visual system rules
- Establish semantic design tokens before screen-level decoration.
- Use a restrained premium palette suitable for a finance/shop tool.
- Strengthen typography hierarchy for amounts, headings, labels, secondary text, and status.
- Prefer bottom sheets/modals for short focused decisions and sticky bottom actions for primary completion.
- Use short purposeful motion only for state change, selection, opening/closing focused surfaces, and success feedback.
- Never let animation delay a sale or hide data.
- Avoid generic card grids when a list, action row, summary strip, or focused panel communicates better.

## Engineering boundaries
- Preserve the existing `src/domain`, accounting service behavior, permission contracts, SQLite schema/migrations, and transactional writes unless a concrete defect is proven.
- UI routes remain thin; screen bodies and reusable interaction primitives remain separated.
- Prefer React Native / Expo APIs over speculative dependencies.
- Keep new reusable interactions in shared components only when they have a real repeated use case.
- No unbounded rendering of potentially large accounting histories.
- No hidden write errors and no success state before durable persistence completes.

## Autonomy rule
During this rebuild, implementation decisions that are reversible and consistent with this contract do not require user confirmation. Do not stop to ask for aesthetic micro-decisions, component placement, spacing, icon choice, or ordinary implementation details. Make the best product decision, implement it, and keep moving.

Escalation is reserved for a true business-rule ambiguity that cannot be resolved from the desktop source, existing tests, or current mobile behavior without risking financial meaning or destructive data changes.

## Completion definition
The rebuild is not complete until:
1. The POS flow has been redesigned around persistent cart/checkout visibility and low-tap interaction.
2. Home has been redesigned as an operational dashboard with fast entry to daily work.
3. Navigation/hubs no longer feel like generic lists of desktop modules.
4. Core lists/forms use the new interaction system where it materially improves speed.
5. RTL/LTR behavior remains correct.
6. Existing accounting behavior remains intact.
7. TypeScript, lint, tests, and Android export quality gates are green.
8. Any intentionally deferred device-only acceptance work is documented explicitly rather than silently called complete.

This contract overrides any tendency to optimize for “all screens exist” over “the seller can work quickly.”
