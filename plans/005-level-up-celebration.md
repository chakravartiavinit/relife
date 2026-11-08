# 005 — Petals when you level up or unlock an achievement

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: petals.tsx, toast.tsx, layout.tsx

## Problem

Levelling up is the rarest, highest-emotion moment in the app, and it only shows a toast
(`announceXp` in src/ui/components/toast.tsx). The sakura burst (src/ui/components/petals.tsx) only
plays when the whole day is done.

## Target

`announceXp` dispatches `window.dispatchEvent(new Event('relife:celebrate'))` on a level-up or an
unlock. A `Celebration` client component in the layout listens and plays the same petal burst
(2.6s, existing `relife-fall` keyframes, skipped under reduced motion). The burst renderer is shared
with `PetalBurst` so there is one implementation.

## Verification

- typecheck passes. In mock mode, run `window.dispatchEvent(new Event('relife:celebrate'))` in the
  console: petals fall once and clean up after ~2.6s. Reduced motion: nothing falls; the toast remains.
