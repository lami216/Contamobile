---
name: react-native-expo
description: Build and review Contamobile React Native + Expo + TypeScript code. Use for components, project structure, Expo Router, native APIs, styling, lists, performance, platform behavior, and dependency decisions.
license: Project-local synthesis based on MIT-licensed Expo and Vercel React Native agent guidance.
metadata:
  project: Contamobile
  version: "1.0"
---

# React Native + Expo Engineering

## Defaults
- TypeScript with strict types; avoid `any` unless boundary data is validated immediately.
- Functional components and hooks.
- Expo Router for routing when starting the native shell.
- Prefer Expo SDK / React Native APIs before third-party libraries.
- Keep route files thin; put substantial screen bodies in `src/screens/` and reusable primitives in `src/components/`.
- Keep platform differences small with `Platform` and larger differences in `.android.tsx` / `.ios.tsx` / `.web.tsx` variants.

## Suggested new-project layout
```text
assets/
src/
  app/          # routes only
  screens/      # screen bodies
  components/   # reusable UI
  features/     # domain feature modules when complexity warrants it
  db/           # SQLite setup, schema, migrations, repositories
  hooks/
  utils/
  theme/
  i18n/
```
Do not force this structure onto imported code until the migration plan establishes the native boundary.

## Components
- Keep render functions readable and small.
- Derive values instead of mirroring them in state.
- Avoid effects for pure computation.
- Memoize only after identifying expensive/repeated work; do not cargo-cult `useMemo`/`useCallback`.
- Stable keys must come from domain identifiers, not array indexes for mutable lists.
- Use `Pressable` for custom touch targets with clear pressed and disabled states.

## Lists and large data
- Use `FlatList`/virtualized lists for potentially large record sets.
- Avoid rendering hundreds of accounting rows inside a `ScrollView`.
- Keep list rows cheap to render.
- Paginate or incrementally query large SQLite datasets rather than loading the whole database into JS.
- Avoid nested same-direction virtualized lists unless necessary.

## Styling
- Use `StyleSheet.create` or the project's chosen single styling system.
- Reuse theme tokens; do not scatter hard-coded colors/spacing/font sizes.
- Prefer logical/start/end semantics that survive RTL.
- Handle safe areas and keyboard overlap.
- Never assume a fixed phone height or width.

## Navigation
- Route params should be serializable and minimal; pass IDs rather than whole mutable records.
- Screen state that belongs to persistence should not live only in navigation params.
- Use stack headers and native navigation semantics where they improve clarity.
- Deep links are optional; architecture should not prevent them.

## Native dependencies
Before adding a package:
1. confirm Expo/React Native does not already solve it;
2. check current Expo SDK compatibility;
3. prefer maintained packages with clear native support;
4. avoid adding a library for a trivial helper;
5. document why the dependency exists.

## Performance
- Measure before micro-optimizing.
- Keep expensive work off critical render paths.
- Avoid synchronous heavy SQLite loops on the JS thread.
- Resize/compress large images appropriately.
- Prefer native-driven animation APIs where animation is required.
- Watch re-render fan-out from global state.

## Errors and data integrity
- Fail visibly and recoverably.
- Never swallow database write errors.
- Financial write operations should be atomic when multiple rows/tables must remain consistent.
- Show user-facing error text without exposing internal stack traces.

## Done criteria
A change is not done until TypeScript, lint, relevant tests, Android runtime behavior, RTL/LTR, and the affected empty/error/loading states have been checked where applicable.
