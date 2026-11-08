# 012 — Settings save bar: fade only under reduced motion

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Accessibility
- **Estimated scope**: 1 class

## Problem

src/ui/components/settings-ui.tsx:85-86 slides the save bar up 8px with no reduced-motion opt-out:
```tsx
dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
```
AUDIT.md: reduced motion removes position changes, keeps opacity.

## Target

```tsx
dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0 motion-reduce:translate-y-0'
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
- **Done when**: With prefers-reduced-motion on, the bar fades in place.
