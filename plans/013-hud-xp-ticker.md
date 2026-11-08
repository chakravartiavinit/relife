# 013 — Roll the banner XP numbers

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Missed opportunity
- **Estimated scope**: 1 file

## Problem

src/ui/components/hud.tsx:56-57 prints "N XP to level M" and "+N XP today" as plain text, so after a
check-off the banner jumps while the row's "+XP" floats up. The app already has a rolling `Ticker`
(src/ui/components/ticker.tsx).

## Target

```tsx
<span><Ticker value={s.next - s.total} /> XP to level {s.level + 1}</span>
<span className="font-medium text-pill-ink">+<Ticker value={s.today} /> XP today</span>
```

## Repo conventions to follow

- Easing tokens: CSS in src/app/globals.css (`--ease-out-quint`, `--ease-out-strong`), JS in src/ui/beui/lib/ease.ts.
- Exemplar: life-kpis.tsx uses `<Ticker value={a} />` the same way.

## Boundaries

- Do NOT touch vendored beUI components other than src/ui/beui/lib/ease.ts.
- Motion values only; no markup changes beyond the lines named.
- If the code has drifted from the excerpts, stop and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass.
- **Feel check**: in DevTools set animation playback to 10% and trigger it; toggle prefers-reduced-motion and confirm movement is dropped but fades remain.
- **Done when**: After a check-off the banner numbers roll to the new value.
