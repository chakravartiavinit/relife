# 006 — Shorten the check-off celebration

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, 4 values

## Problem

Checking off a routine is the most repeated action in the app (tens of times a day). The win animation
holds the save for 460ms and layers a 500ms row flash and a 700ms "+XP" float on top, so every check-off
takes about 1.2s to settle (src/ui/components/agenda.tsx:158-163, 166-167, 195-196):

```tsx
setTimeout(onToggle, 460)
transition={{ duration: 0.5, ease: 'easeOut' }}            // row flash
transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}   // +XP float
```
AUDIT.md: high-frequency actions get minimal motion; UI animations stay under 300ms. The celebration
itself was asked for, so keep it and make it quick.

## Target

```tsx
setTimeout(onToggle, 280)
transition={{ duration: 0.3, ease: EASE_OUT_STRONG }}      // row flash
transition={{ duration: 0.4, ease: EASE_OUT_STRONG }}      // +XP float
```
The burst (ring and sparks, 450ms) stays; it runs alongside, not after.

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- Imports EASE_OUT_STRONG from plan 009 (`@/ui/beui/lib/ease`).

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Row flips to Done within ~300ms of the tap; burst still visible; reduced motion still toggles instantly.
