# 004 — Entrance animations for every chart

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: globals.css, charts.tsx, capsule.tsx, xp.tsx, overview/page.tsx, profile/page.tsx

## Problem

The dither area/bar charts already sweep in (700ms, cubic ease) and the beUI heat calendar staggers
in with springs. Everything else teleports onto the page with its final value:

- Sparklines: `src/ui/components/charts.tsx:108` renders `<DitherSparkline … />` with its default `animate={false}`.
- Ranked bars: `charts.tsx:129` `style={{ width: … }}` — static width.
- Capsule progress: `src/ui/components/capsule.tsx:29` transitions value changes (500ms, over the 300ms
  UI budget) but has no entrance.
- Level ring: `src/ui/components/xp.tsx:62` static `strokeDashoffset`.
- Consistency grid: `src/app/overview/page.tsx:124` cells appear all at once.
- XP-by-kind stacked bar: `src/app/profile/page.tsx:144` static widths.

## Target

CSS-only, no JS, interruptible: a transition on the property plus `@starting-style` for the first
frame. Values change later (water +250) transition from the current state.

```css
/* src/app/globals.css */
.reveal-fill {            /* horizontal fills: capsule, ranked bars, stacked bar */
  clip-path: inset(0 calc(100% - var(--fill, 100%)) 0 0 round 9999px);
  transition: clip-path 300ms var(--ease-out-quint);
}
@starting-style { .reveal-fill { clip-path: inset(0 100% 0 0 round 9999px); } }
.reveal-fill[data-entrance] { transition-duration: 700ms; transition-timing-function: var(--ease-out-strong); transition-delay: calc(var(--i, 0) * 50ms); }

.reveal-ring { stroke-dashoffset: var(--off); transition: stroke-dashoffset 1000ms var(--ease-out-strong) 150ms; }
@starting-style { .reveal-ring { stroke-dashoffset: var(--len); } }

.reveal-cell { transition: opacity 400ms var(--ease-out-strong), scale 400ms var(--ease-out-strong); transition-delay: calc(var(--col, 0) * 30ms); }
@starting-style { .reveal-cell { opacity: 0; scale: 0.6; } }

@media (prefers-reduced-motion: reduce) { .reveal-fill, .reveal-ring, .reveal-cell { transition: none; } }
```

- Sparkline: pass `animate` (dither-kit's own 900ms sweep; it already skips under reduced motion).
- Capsule: set `--fill` inline instead of `clip-path`; class `reveal-fill`. Value changes now 300ms.
- Ranked bars: inner span full width, `reveal-fill`, `--fill` = share, `data-entrance`, `--i` = row index.
- Level ring: progress circle gets `reveal-ring`, `--len` = circumference, `--off` = target offset.
- Consistency cells: `reveal-cell`, `--col` = column index.
- Stacked bar: wrap the segments in a `reveal-fill` container with `--fill: 100%` and `data-entrance`.

## Boundaries

- Do NOT edit `src/ui/dither-kit/` or `src/ui/beui/`. Do NOT animate width/height.

## Verification

- typecheck + tests pass.
- **Feel check**: load Overview, Profile, Health, Wealth, Trackers at 10% speed (Animations panel):
  fills grow from the left, the ring draws clockwise after a short beat, grid columns ripple left to
  right, sparklines sweep. Tap "+250 ml" twice quickly: the capsule retargets smoothly, never restarts.
  Reduced motion: everything appears in its final state.

## Execution note

Implemented with one-time keyframes (`animation: … backwards`) instead of `@starting-style`: Chrome
does not run `@starting-style` transitions for server-rendered content present at first render. The
`backwards` fill mode matters: with `both`, the finished animation keeps overriding the property and
later value changes (water +250) jump instead of transitioning. Value changes use a 300ms
`--ease-out-quint` transition. `data-entrance` was dropped; every fill enters the same way.
