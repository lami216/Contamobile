# Contamobile — Agent Instructions

## Mission
Build a polished Android-first mobile edition of the existing desktop accounting/shop-management application. The mobile app is not a shrunken desktop UI. Preserve business rules and data behavior, then redesign each workflow for touch, small screens, one-handed use, and offline operation.

## Product constraints
- Android-first. Keep architecture portable to iOS when it does not harm Android quality.
- Local-first and usable with no internet and no backend/server.
- SQLite is the default durable application database unless repository evidence requires another local store.
- Arabic is first-class. RTL must be correct structurally, not simulated with text alignment hacks.
- French/LTR must remain possible without redesigning screens.
- Never remove a desktop feature merely because it is difficult to fit on mobile. Reorganize it into an appropriate mobile flow.
- Preserve accounting correctness over visual convenience.
- Do not invent business rules. When porting, trace them to the source application.

## Preferred stack
- React Native + Expo + TypeScript.
- Expo Router for navigation unless the imported codebase provides a compelling reason otherwise.
- Expo/React Native APIs before adding third-party packages.
- Design tokens and reusable primitives instead of screen-specific visual constants.

## UI quality bar
- Native mobile interaction patterns; no desktop tables squeezed into phone widths.
- Clear hierarchy, short task paths, predictable back behavior, useful empty/loading/error states.
- Touch targets >= 44x44 pt/dp where practical.
- Important actions reachable without precision tapping.
- Forms optimized for mobile keyboards and input types.
- Lists/cards must scale to real accounting data volumes.
- Charts are supporting information, never substitutes for readable numbers.
- Support light/dark only if it can be done consistently; do not partially theme the app.

## Required workflow for every migrated feature
1. Read the corresponding desktop implementation and identify business rules, inputs, outputs, validation, persistence, and edge cases.
2. Write a short mobile interaction plan before changing UI.
3. Reuse domain logic where safe; rewrite platform/UI code rather than imitating desktop layout.
4. Implement persistence and migrations deliberately.
5. Test Arabic RTL and French/LTR behavior.
6. Test small Android screens and long/large data.
7. Run typecheck/lint/tests available in the repo.
8. Review the final screen for accessibility, touch ergonomics, loading/empty/error states, and accidental data loss.

## Skill routing
Project skills live in `.agents/skills/`. Load the matching `SKILL.md` before performing specialized work. Multiple skills may be combined when a task crosses domains.

## Safety for repository changes
- Make incremental, reviewable changes.
- Do not delete imported source material until the mobile equivalent is verified.
- Avoid speculative dependencies.
- Never commit secrets, tokens, credentials, generated signing keys, or local databases containing real user data.
