# 008 — Level-up label: animate transform and opacity only

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Performance
- **Estimated scope**: 1 line

## Problem

src/ui/components/celebrate.tsx:94 animates letter-spacing, which re-lays out text every frame while
36 confetti pieces, rays and a backdrop blur run:
```tsx
initial={{ opacity: 0, letterSpacing: '0.1em', y: 8 }} animate={{ opacity: 1, letterSpacing: '0.4em', y: 0 }}
```
AUDIT.md: animate transform and opacity only.

## Target

```tsx
initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
```
Letter spacing stays at the class's `tracking-[0.4em]`.

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.


## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Label rises and fades in; no layout in the Performance panel during the level-up.
