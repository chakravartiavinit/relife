# 014 — Fade in the all-done line and opened details

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Missed opportunity
- **Estimated scope**: 2 files

## Problem

src/ui/components/agenda.tsx:92-97 shows "Everything for today is checked off." instantly; it's a rare,
emotional moment. `<details>` panels (agenda Done list, Inbox, Notifications) snap open while their
chevrons rotate in 150ms.

## Target

```tsx
<p className="rise flex items-center gap-2 px-1 text-[13.5px] text-ink-2">   // agenda.tsx: existing .rise entrance
```
```css
/* globals.css: opacity only, so it costs nothing and needs no reduced-motion variant */
details::details-content { opacity: 0; transition: opacity 150ms var(--ease-out-quint), content-visibility 150ms allow-discrete; }
details[open]::details-content { opacity: 1; }
```

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- `.rise` is defined in src/app/globals.css (relife-rise).

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: Line rises in once; details content fades in with its chevron; browsers without ::details-content just open instantly.
