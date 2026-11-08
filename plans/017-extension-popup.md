# 017 · Extension popup redesign

Status: DONE · base commit 7c8f449

## What changed
- `extension/popup.html|css|js`, `extension/icons.js` (inline Lucide SVG). Manifest 0.4.0.
- Cards: On this page (site, today's time, kind chips), Library (tracked item with cover, progress
  and time, or Track this), Today (total, stacked bar by kind, legend). Settings is its own view.
- The status pill is the pause switch; the eye button on the site row excludes the site.
- Data from `GET /api/activity?view=1&domain=&item=` (`popupView` in `src/core/activity.ts`).

## Motion (app tokens copied into popup.css)
- Main ↔ settings: `translate` ±16px + opacity, 220ms `cubic-bezier(0.23, 1, 0.32, 1)` / 150ms
  `cubic-bezier(0.2, 0, 0, 1)`; transitions, so a quick back-and-forth reverses. Instant on first paint.
- Track form: grid rows 0fr→1fr, 220ms strong ease-out, opacity 150ms.
- Toast: in with opacity + 6px rise (200ms), out with opacity only.
- Chips, buttons, pill: colour 150ms, press `scale: 0.96`.
- Check after tracking: scale 0.25→1, opacity, blur 4px→0 in 300ms.
- No entrance animation on open: the popup opens many times a day. Reduced motion keeps fades only.
