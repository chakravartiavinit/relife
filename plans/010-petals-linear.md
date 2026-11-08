# 010 — Petals drift at a constant speed

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Easing & duration
- **Estimated scope**: 1 line

## Problem

src/ui/components/petals.tsx:60 drops petals on a strong ease-out, so they fall most of the way in the
first third and then hang:
```tsx
animation: `relife-fall ${1.8 + (i % 4) * 0.2}s cubic-bezier(0.2,0,0,1) ${(i % 7) * 0.08}s both`
```
AUDIT.md: constant motion uses linear.

## Target

```tsx
animation: `relife-fall ${1.8 + (i % 4) * 0.2}s linear ${(i % 7) * 0.08}s both`
```

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.


## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Petals drift down evenly; the fade-out in the keyframes still ends them softly.
