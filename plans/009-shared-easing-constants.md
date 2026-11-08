# 009 — One set of easing constants in JS

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: ~7 files, find-and-replace

## Problem

The strong ease-out `[0.23, 1, 0.32, 1]` is retyped in src/ui/components/quests.tsx:30,
onboarding-flow.tsx:24, celebrate.tsx:19 and agenda.tsx (4 places). `[0.2, 0, 0, 1]` is retyped in
row-menu.tsx:65, region-picker.tsx:110 and agenda.tsx:82, though `@/ui/beui/lib/ease` exports it as
EASE_OUT. `MOTION` in src/ui/tokens.ts and `--ease` in globals.css are unused duplicates.

## Target

```ts
// src/ui/beui/lib/ease.ts
export const EASE_OUT = [0.2, 0, 0, 1] as const;          // = --ease-out-quint, UI state changes
export const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const; // = --ease-out-strong, entrances
```
Every hand-typed copy imports these. Delete `MOTION` (tokens.ts) and `--ease` (globals.css).

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- CSS tokens stay in src/app/globals.css @theme (--ease-out-quint, --ease-out-strong).

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: `grep -rn "0.23, 1, 0.32, 1\|0.2, 0, 0, 1" src/ui/components` returns nothing outside ease.ts.
