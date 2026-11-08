# 007 — Stop the endless chest wobble and close the chest modal fast

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Purpose & frequency / Cohesion
- **Estimated scope**: 1 file

## Problem

src/ui/components/quests.tsx:64-65 wobbles the "chest to open" card forever on a page seen many times a day:
```tsx
animate={{ rotate: [0, -6, 6, -4, 0] }}
transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
```
src/ui/components/quests.tsx:235-236: the chest modal exit inherits the 350ms enter transition; dialogs here close in 150ms.

## Target

```tsx
transition={{ duration: 0.6, repeat: 2, repeatDelay: 2.4, ease: 'easeInOut' }}   // wobble 3 times, then rest
exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
```

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- Exemplar: dialog exit 150ms in src/ui/components/forms/dialog.tsx.

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Chest card wobbles three times after mount and stops; closing the chest modal takes 150ms.
