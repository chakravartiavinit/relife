# 011 — Compact region picker opens from its corner

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 1 line

## Problem

src/ui/components/region-picker.tsx:112 scales the compact picker from `top` centre although it is pinned
to the trigger's end edge (`end-0`):
```tsx
style={{ transformOrigin: 'top' }}
```
AUDIT.md: popovers scale from their trigger.

## Target

```tsx
style={{ transformOrigin: compact ? 'top right' : 'top' }}
```
(The app is left-to-right only; flip to `top left` if RTL is ever added.)

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- Exemplar: row-menu.tsx uses `transformOrigin: 'top right'`.

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Compact picker grows out of its trigger corner at 10% speed.
