# Contamobile Agent Skill Stack

Repository-local skills are placed under `.agents/skills/<skill-name>/SKILL.md` for cross-agent compatibility.

## Installed project skills

| Skill | Purpose |
|---|---|
| `mobile-ui-ux` | Touch-first information architecture, design system, forms, dashboards, lists, charts, visual and accessibility review |
| `react-native-expo` | React Native + Expo + TypeScript architecture, components, navigation, dependencies and performance |
| `offline-sqlite` | Local-only SQLite persistence, transactions, migrations, backup/restore and query discipline |
| `rtl-localization` | Arabic RTL + French LTR layout, translation, formatting and language switching |
| `desktop-to-mobile-migration` | Preserve business rules while redesigning desktop workflows for phones |
| `mobile-quality` | Accessibility, performance, state coverage, regression testing and release gates |

## Upstream guidance consulted

These project skills intentionally consolidate the relevant rules instead of copying many overlapping upstream skill trees verbatim.

- Expo official agent skills: https://github.com/expo/skills
  - `expo-project-structure`
  - `expo-design-system`
  - `expo-native-ui`
  - `expo-router`
  - `expo-animation`
  - `expo-web-to-native`
  - `expo-ui`
- Vercel Agent Skills: https://github.com/vercel-labs/agent-skills
  - `react-native-skills`
- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Agent Skills open specification: https://agentskills.io/specification

## Why consolidated local skills?

The app has unusual constraints: accounting correctness, Android-first ergonomics, no required server/internet, SQLite, Arabic RTL and French LTR, and feature parity with an existing desktop application. Generic skills are useful references, but the local skills make these constraints explicit and prevent contradictory defaults.

## When source code is imported

1. Do not redesign immediately.
2. Inventory the source architecture and feature set.
3. Create `docs/MOBILE_PARITY.md`.
4. Identify reusable domain logic and platform-specific UI/storage code.
5. Decide the Expo/native project boundary.
6. Build the first vertical slice end-to-end (database → domain logic → native UI → RTL/LTR → tests).
7. Only then expand feature-by-feature.
