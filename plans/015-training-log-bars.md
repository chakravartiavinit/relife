# 015 — Training log bars grow in by week

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Missed opportunity / Cohesion & tokens
- **Estimated scope**: 1 CSS block, 1 component

## Problem

Skills had a separate chart per source (GitHub bars + heat calendar, a competitive-programming bar chart), each
with its own entrance. They were replaced by one Training log (src/ui/components/training-log.tsx): a row of
day bars per stream on a shared axis. The new bars need an entrance that matches the app's chart reveals.

## Target

```css
/* src/app/globals.css */
@keyframes reveal-bar { from { transform: scaleY(0); } }
.reveal-bar {
  transform-origin: bottom;
  animation: reveal-bar 500ms var(--ease-out-strong) backwards;   /* cubic-bezier(0.23, 1, 0.32, 1) */
  animation-delay: calc(var(--col, 0) * 40ms);                     /* --col = week index, 8 weeks → ≤280ms */
}
@media (prefers-reduced-motion: reduce) { .reveal-bar { animation: none; } }
```
Each bar sets `--col` to its week index. Transform only (GPU), runs once on page load, bars stay as the static cue.

## Verification

- Feel check at 10% speed: bars rise from the baseline week by week, left to right; nothing moves on hover.
- Reduced motion: bars appear at full height with no movement.
