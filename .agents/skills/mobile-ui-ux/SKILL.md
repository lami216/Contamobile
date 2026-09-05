---
name: mobile-ui-ux
description: Design and review polished touch-first mobile UI/UX for Contamobile. Use for screens, navigation, forms, lists, dashboards, cards, charts, states, responsive layouts, design tokens, accessibility, or any visual redesign from desktop to phone.
license: Project-local guidance; informed by Expo Design System, Material guidance, React Native practices, and UI/UX Pro Max concepts.
metadata:
  project: Contamobile
  version: "1.0"
---

# Contamobile Mobile UI/UX

## Goal
Produce a professional accounting app that feels intentionally designed for Android phones. Never solve mobile layout by shrinking a desktop screen.

## Before designing
1. Identify the user's actual job on the screen: check, record, edit, search, compare, collect payment, review history, etc.
2. Identify the primary action, secondary actions, and dangerous/destructive actions.
3. Identify what must remain visible and what can move behind progressive disclosure.
4. Inspect the source desktop feature so no business capability is silently lost.

## Information architecture
- Prefer 3–5 stable top-level destinations. Put secondary destinations under More/Settings rather than adding endless tabs.
- Use bottom navigation for frequent peer destinations; stacks for drill-down; sheets/dialogs for short focused tasks.
- Preserve context when moving between list → detail → edit.
- Back must behave predictably and never discard unsaved data silently.
- Avoid nesting navigation patterns unnecessarily.

## Screen hierarchy
Each screen should normally contain:
1. clear title/context;
2. primary information or task;
3. one obvious primary action when appropriate;
4. secondary controls grouped nearby;
5. visible states for loading, empty, error, offline, disabled, and success where relevant.

Do not decorate first. Make hierarchy, spacing, alignment, touch behavior, and wording correct first.

## Design system
Use one source of truth for:
- semantic colors;
- spacing on a 4pt grid;
- typography roles;
- radii;
- shadows/elevation;
- icon sizes;
- motion durations.

Repeated literal visual values belong in theme tokens. Repeated UI structures belong in shared components only after a real reuse case appears.

## Touch rules
- Prefer >=44x44 interactive targets.
- Never make a tiny icon the only way to perform an important action.
- Give pressed/disabled/loading feedback.
- Keep destructive actions separated from frequent actions and require confirmation when data loss is meaningful.
- Place high-frequency actions in thumb-reachable areas when possible.

## Accounting-specific mobile patterns
- Replace wide desktop tables with searchable lists, compact row summaries, expandable detail, or horizontal data views only when comparison genuinely requires columns.
- Keep money, quantity, due amount, and status visually scannable.
- Use locale-aware formatting for currency, dates, and numbers.
- For payment/sale entry, minimize taps and keyboard switching.
- For dense records, show the 2–4 values needed to choose a record, then reveal full detail after tap.
- Never hide critical totals merely to make a layout look cleaner.

## Forms
- Use correct keyboard/input modes.
- Put labels outside fields when ambiguity is possible.
- Show validation next to the offending field.
- Preserve entered values on recoverable errors.
- Use sensible defaults but never fabricate financial values.
- Keep the final confirmation/submit action clear and stable.

## Visual quality
- Prefer restrained, coherent styling over excessive gradients, shadows, glass effects, or animation.
- Use whitespace to group meaning, not to waste phone space.
- Limit simultaneous accent colors.
- Icons support labels; they should not replace unclear concepts.
- Avoid generic dashboard-card spam. Use cards only when grouping improves comprehension.

## Motion
Motion should explain state or navigation, not entertain. Keep transitions short, interruptible, and consistent. Respect reduced-motion settings when available.

## Accessibility review
- text remains legible at larger font settings;
- contrast is adequate;
- controls have accessibility roles/labels where needed;
- state is not communicated by color alone;
- screen order makes sense for assistive technology;
- touch targets are forgiving.

## Final design QA
Before considering a screen done, ask:
- Can a new shop worker understand the next action without training?
- Is the most important number/action visible?
- Is anything present only because it existed in the desktop layout?
- Does Arabic RTL look deliberately designed?
- Does French LTR still feel natural?
- Does the screen survive long names, large numbers, empty data, and many records?
- Can the feature be completed one-handed without precision tapping?
