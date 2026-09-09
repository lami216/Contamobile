---
name: premium-mobile-interaction
description: Build a coherent premium interaction and visual system for Contamobile using React Native/Expo without sacrificing seller speed. Use for design tokens, visual hierarchy, motion, sticky actions, bottom sheets/modals, feedback states, iconography, and polished Android interaction.
metadata:
  project: Contamobile
  version: "1.0"
---

# Premium Mobile Interaction

## Definition of premium
Premium means the interface feels intentional, calm, fast, trustworthy, and responsive. It does not mean gradients, glass, shadows, or animation everywhere.

## Visual hierarchy
- Give primary amounts and actions obvious dominance.
- Use one restrained accent system and semantic success/warning/danger colors.
- Establish hierarchy through type weight/size, spacing, grouping, elevation, and contrast before decoration.
- Use cards only when they create a meaningful group; avoid card spam.
- Keep financial numbers easy to scan with tabular figures where possible.

## Layout
- Respect safe areas and Android keyboard behavior.
- Use sticky/fixed bottom action areas for high-frequency completion actions when content scrolls.
- Use focused modal/sheet-style surfaces for short decisions that should preserve underlying context.
- Keep touch targets forgiving and avoid small unlabeled icons for important actions.
- Compose RTL deliberately; do not rely on text alignment alone.

## Motion
Use short motion to explain state changes:
- opening/closing a focused surface;
- adding/removing/selecting an item;
- success acknowledgement;
- expanding optional detail.

Rules:
- motion must never delay a transaction;
- prefer React Native/Expo/native-supported animation paths before dependencies;
- keep durations short and consistent;
- no decorative looping motion;
- preserve usability when animation is interrupted.

## Feedback
Every meaningful action should expose state through one or more of:
- pressed visual state;
- disabled state;
- loading state;
- inline validation;
- success acknowledgement;
- warning state;
- destructive confirmation when loss is meaningful.

Do not use `Alert` for every ordinary success. Prefer lightweight in-context acknowledgement when the user should continue working.

## Forms
- Use labels that remain visible when values are entered.
- Use correct keyboard types.
- Prefer pickers, chips, steppers, defaults, and focused controls over raw text fields when the domain is constrained.
- Keep the primary submit action stable and reachable.
- Preserve entered values after recoverable validation errors.

## Empty/loading/error states
- Empty states explain the next useful action, not only `No data`.
- Loading should preserve layout where possible and avoid jumpy screens.
- Errors must say what the user can do next.
- Offline is normal for this app, not an error state by itself.

## Component bar
Shared components should have:
- consistent radius/elevation/spacing;
- pressed and disabled feedback;
- accessibility roles/labels where needed;
- RTL/LTR-safe composition;
- no screen-specific magic values when a semantic token fits.

## Performance bar
Polish must not create sluggishness:
- no unnecessary rerender-heavy animation;
- no rendering hundreds of rows in ScrollView;
- no oversized visual assets on transactional screens;
- no dependency for a trivial effect.

## Review questions
Before calling a screen premium, ask:
- Is the primary action obvious within one second?
- Does the screen feel quieter after hierarchy improvements, not busier?
- Does every decorative element communicate state or structure?
- Does touch feedback feel immediate?
- Can the seller understand success/failure without reading a paragraph?
- Does the screen still feel polished in Arabic RTL and French LTR?

If polish makes the workflow slower, remove the polish.
