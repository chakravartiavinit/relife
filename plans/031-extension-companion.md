# 031 · Extension companion (Today in the toolbar)

Status: DONE

## What changed
- Popup has two tabs: **Today** (character, quick log, quests, screen time) and **This page** (site and library,
  as in 017). The last tab used is remembered. Manifest 0.6.0.
- `GET/POST /api/companion` (`src/app/api/companion/route.ts`, `src/core/companion.ts`, counting rules in
  `src/domain/companion.ts`, tested). Same bearer token as `/api/activity`; 503 until Laptop activity is connected.
- Toolbar badge: open quests left, `✓` when done, `off` when paused, `!` when offline. Can be turned off.
- Shortcuts: `Alt+Shift+R` opens the popup, `Alt+Shift+P` pauses. Icon menu: pause, send now, open ReLife.
- Options page (`options.html`): connection, sync status with Send now, excluded sites, tracked items, shortcuts.
- Unsent stretches moved from session to local storage, so a browser restart keeps them. Old queues are migrated
  on update.
- Every authorised extension request marks the `extension` heartbeat; Activity's setup card shows when it was last seen.

## Motion
- Tabs switch instantly (no slide); the selected tab is a static cue (surface + shadow).
- Routine check: colour 150ms, check icon pops in with the app's icon swap (scale 0.25→1, blur 4px→0, 300ms).
- Buttons, tabs and checks press to `scale: 0.96`. Reduced motion drops the scale and keeps colour fades.
- Loading is a static tinted placeholder sized like the cards; no shimmer.
