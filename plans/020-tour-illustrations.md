# 020 — Draw the seven animated tour illustrations

- **Status**: DONE (illustrations and `/dev/ui` gallery; wiring into `steps.ts` waits on 019)
- **Commit**: 6330ed7
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 3 new files in `src/ui/components/tour/` (`illos.tsx`, `illo-kit.tsx`, `illo.module.css`), about 700 lines in total, most of it SVG and keyframes
- **Depends on**: 019 (the tour shell imports these from `steps.ts`)

## As built

- `src/ui/components/tour/illo-kit.tsx` + `illos.tsx`. Instead of a CSS module with hand-computed percentages,
  `timeline(id, seconds, tracks)` turns per-element stops written in seconds into keyframes, emitted in a `<style>`
  inside each SVG. Curves come from `EASE_OUT_STRONG`, `EASE_IN_OUT` and `EASE_OUT` in `ease.ts`, so none are retyped.
- Each track's `end` is the finished frame; reduced motion turns animations off and hides the cursor.
- Checked in `/dev/ui` at fixed times (light, dark, reduced motion); every loop's last frame matches its first.

## Problem

Plan 019's tour card has an empty illustration plate. The reference tour
(https://kestrel-app-eta.vercel.app/runs?tour) uses no GIFs or videos. Each step shows an **inline SVG, viewBox
720×460, animated with CSS `@keyframes`**: a simplified copy of the real UI, plus a fake cursor that moves,
presses and makes the UI react. These SVGs are crisp at any size, theme with CSS variables, weigh a few KB
each and can be paused or turned off. ReLife needs seven of them, one per tour stop.

## Target

### Technique (applies to all seven)

- One React component per illustration, returning
  `<svg viewBox="0 0 720 460" className={s.illo} role="img" aria-label="…">`. The `aria-label` text is given per
  illustration below. The plate is decorative next to the card text, but the label helps screen-reader users.
- **One clock per illustration.** Every animated element uses the same duration `D` and
  `animation: <name> D linear infinite`. Timing lives in the keyframe percentages, with
  `animation-timing-function` set **inside** the keyframe that starts each segment. Convert a time to a
  percentage with `t / D × 100`, rounded to 3 decimals.
- **Curves** (use the global tokens; never retype them):
  - `var(--ease-in-out-strong)`: the cursor moving between points (on-screen movement).
  - `var(--ease-out-strong)`: anything appearing, filling or popping in.
  - `var(--ease-out-quint)`: the reset at the end of the loop and small colour or opacity changes.
- **Appear** = `opacity 0→1` together with `scale(0.92)→scale(1)` over 0.25s. Never `scale(0)`.
  **Icon swap** = `scale(0.25)→1`, `opacity 0→1`, `filter: blur(4px)→blur(0)` over 0.25s (AGENTS.md icon rule).
  **Press** = scale `1 → 0.88` in 0.1s, then `0.88 → 1` in 0.25s. **Bars** = `scaleX`, never `width`.
- **Loop seam:** hold the finished frame for at least 0.6s. Over the last 0.3–0.4s, fade the "after" elements back
  to their start state with `--ease-out-quint`, and have the cursor already back at rest. Then 100% equals 0%, so the loop never jumps.
- **Only `transform`, `opacity` and `filter` animate.** One exception: `stroke-dashoffset` for line draws
  (a single small path, like the repo's `.reveal-ring`). For SVG transforms set
  `transform-box: fill-box; transform-origin: <x> <y>` on the class. The cursor's translate uses view-box units: leave
  `transform-box` at its default and write `translate(560px, 392px)`, where 1px = 1 viewBox unit.
- **Animate `<g>` wrappers, never nested `<svg>` elements.** Safari ignores CSS transforms on nested `<svg>`. Lucide
  icons render a nested `<svg>`, so wrap each one: `<g className={s.x}><Check x={…} y={…} width={24} height={24} … /></g>`.
- **Theme.** Use only CSS variables, so `[data-theme="dark"]` just works. Never `prefers-color-scheme`, never hex:
  - surface panels: `fill="var(--surface)"`, `stroke="var(--i-line)"`, `strokeWidth={2}`
  - text: `var(--ink)`, `var(--ink-2)`, `var(--ink-3)`. Accent: `var(--pill)`. Status: `var(--good)`. Area marks: `var(--cat-*)`.
  - Defined on `.illo` (see the CSS below): `--i-line`, `--i-bar`, `--i-pill-fill`, `--i-good-fill`.
- **Type.** `<text>` inherits Inter from the page. The card plate is ~304px wide (scale 0.42), so use these sizes in viewBox units:
  body 28 (≈12px), small 22, title 32 weight 600. Mono labels:
  `fontFamily="ui-monospace, SFMono-Regular, monospace"`, size 20, `letterSpacing={3}`, weight 600, uppercase, like
  `SystemLabel`. Numbers get `style={{ fontVariantNumeric: 'tabular-nums' }}`.
- **Reduced motion: show the finished frame.** Every element's **base CSS** (outside the keyframes) is its *finished* state.
  Then `animation: none` leaves a complete picture:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .illo * { animation: none !important; }
    .cursor { display: none; }
  }
  ```
  Transient elements (the "+12 XP" float, the tap ripple) have base `opacity: 0`.
- Illustrations mount only while their step is showing (plan 019 keys the card body by step), so each loop starts at
  0% on entry and nothing runs off-screen.

### Shared kit — `src/ui/components/tour/illo-kit.tsx`

```tsx
import s from './illo.module.css'
import { cn } from '@/ui/cn'

/** Pointer arrow, tip at (0,0). `move` and `press` are this illustration's keyframe classes. */
export function Cursor({ move, press }: { move: string; press: string }) {
  return (
    <g className={cn(s.cursor, move)}>
      <g className={cn(s.press, press)}>
        <path transform="scale(1.5)" d="M0 0V26L6.5 20L10.8 29.5L14.6 27.8L10.4 18.6H19Z"
          fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" />
      </g>
    </g>
  )
}

/** Rounded status chip. `tone` picks the fill and text colour. */
export function Chip({ x, y, w, label, tone = 'good', className }: {
  x: number; y: number; w: number; label: string; tone?: 'good' | 'pill'; className?: string
}) {
  return (
    <g className={className}>
      <rect x={x} y={y} width={w} height={36} rx={18} fill={tone === 'good' ? 'var(--i-good-fill)' : 'var(--i-pill-fill)'} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fontSize={20} fontWeight={600}
        fill={tone === 'good' ? 'var(--good)' : 'var(--pill)'}>{label}</text>
    </g>
  )
}
```

`cn` lives at `src/ui/cn.ts`, and `@/*` maps to `src/*`, so `'@/ui/cn'` resolves.

### Shared CSS — top of `src/ui/components/tour/illo.module.css`

```css
.illo {
  display: block; width: 100%; height: 100%;
  --i-line: color-mix(in oklch, var(--ink) 14%, transparent);
  --i-bar: color-mix(in oklch, var(--ink) 8%, transparent);
  --i-pill-fill: color-mix(in oklch, var(--pill) 14%, var(--surface));
  --i-good-fill: color-mix(in oklch, var(--good) 16%, var(--surface));
}
.press { transform-box: fill-box; transform-origin: 0 0; }
.pop   { transform-box: fill-box; transform-origin: 50% 50%; }
.barL  { transform-box: fill-box; transform-origin: 0 50%; }

@media (prefers-reduced-motion: reduce) {
  .illo * { animation: none !important; }
  .cursor { display: none; }
}
```

Name keyframes `<illo>_<part>` (`today_fill`). CSS Modules scope them automatically.

---

### Exemplar, written out in full: `IlloToday` (step 1, D = 4.4s)

`aria-label`: "A daily quest bar fills from synced steps and clears, then a cursor checks off a routine and earns 12 XP."

**Layout**

| Element | Geometry |
|---|---|
| Quest panel | `rect x40 y36 w640 h150 rx20`, surface |
| Label | mono "DAILY QUEST · RANK C" at x72 y84, fill `var(--ink-3)` |
| Title | "Walk 8,000 steps" at x72 y126, size 32, weight 600, ink |
| Count (two texts, same spot) | x648 y126 `textAnchor="end"`, size 26, ink-2, tabular: `.cOld` "4,400" and `.cNew` "8,000" |
| Track / fill | `rect x72 y146 w576 h14 rx7` with fill `var(--i-bar)`; the same rect with fill `var(--pill)` and `className={cn(s.barL, s.today_fill)}` |
| Cleared chip | `<Chip x={552} y={54} w={96} label="Cleared" className={cn(s.pop, s.today_chip)} />` |
| Routines panel | `rect x40 y210 w640 h214 rx20`, surface; divider `line x1 72 x2 648 y 317`, stroke `var(--i-line)` |
| Row 1 | circle cx88 cy263 r17, stroke `var(--i-line)` 3, no fill; "Drink water" x124 y272 size 28 ink; "2 / 8" x648 y272 end, ink-3 tabular |
| Row 2 | empty circle cx88 cy370 r17 (same style); a `.today_check` group on top: a circle with the same geometry, fill `var(--ink)`, plus Lucide `Check` x77 y359 w22 h22, `color="var(--surface)"`, `strokeWidth={3}`; text "Read 20 min" x124 y379, class `.today_done` |
| XP float | text "+12 XP" x290 y379 size 24 weight 600 fill `var(--pill)`, class `.today_xp` |
| Cursor | `<Cursor move={s.today_move} press={s.today_press} />`; rest = translate(560,392); target = translate(92,374) (tip on row 2's circle) |

**CSS** (append to `illo.module.css`)

```css
/* IlloToday · D = 4.4s. Finished frame = base styles. */
.today_fill  { transform: scaleX(1);                     animation: today_fill 4.4s linear infinite; }
.today_cOld  { opacity: 0;                               animation: today_cOld 4.4s linear infinite; }
.today_cNew  { opacity: 1;                               animation: today_cNew 4.4s linear infinite; }
.today_chip  { opacity: 1; transform: scale(1);          animation: today_chip 4.4s linear infinite; }
.today_check { opacity: 1; transform: scale(1); filter: blur(0); transform-box: fill-box; transform-origin: 50% 50%;
               animation: today_check 4.4s linear infinite; }
.today_done  { opacity: .5;                              animation: today_done 4.4s linear infinite; }
.today_xp    { opacity: 0;                               animation: today_xp 4.4s linear infinite; }
.today_move  { transform: translate(560px, 392px);       animation: today_move 4.4s linear infinite; }
.today_press { transform: scale(1);                      animation: today_press 4.4s linear infinite; }

/* 0.3–1.2s: quest bar 55% → 100%. 3.9–4.2s: reset. */
@keyframes today_fill {
  0%, 6.818% { transform: scaleX(.55); animation-timing-function: var(--ease-out-strong); }
  27.273%, 88.636% { transform: scaleX(1); animation-timing-function: var(--ease-out-quint); }
  95.455%, 100% { transform: scaleX(.55); }
}
/* 1.0–1.15s: count swaps 4,400 → 8,000 */
@keyframes today_cOld {
  0%, 22.727% { opacity: 1; animation-timing-function: var(--ease-out-quint); }
  26.136%, 88.636% { opacity: 0; animation-timing-function: var(--ease-out-quint); }
  95.455%, 100% { opacity: 1; }
}
@keyframes today_cNew {
  0%, 22.727% { opacity: 0; animation-timing-function: var(--ease-out-quint); }
  26.136%, 88.636% { opacity: 1; animation-timing-function: var(--ease-out-quint); }
  95.455%, 100% { opacity: 0; }
}
/* 1.2–1.45s: Cleared chip appears */
@keyframes today_chip {
  0%, 27.273% { opacity: 0; transform: scale(.92); animation-timing-function: var(--ease-out-strong); }
  32.955%, 88.636% { opacity: 1; transform: scale(1); animation-timing-function: var(--ease-out-quint); }
  93.182%, 100% { opacity: 0; transform: scale(1); }
}
/* 1.5–2.1s cursor to row 2; 2.9–3.5s back to rest */
@keyframes today_move {
  0%, 34.091% { transform: translate(560px, 392px); animation-timing-function: var(--ease-in-out-strong); }
  47.727%, 65.909% { transform: translate(92px, 374px); animation-timing-function: var(--ease-in-out-strong); }
  79.545%, 100% { transform: translate(560px, 392px); }
}
/* 2.15–2.25s press, 2.25–2.5s release */
@keyframes today_press {
  0%, 48.864% { transform: scale(1); animation-timing-function: var(--ease-out-strong); }
  51.136% { transform: scale(.88); animation-timing-function: var(--ease-out-strong); }
  56.818%, 100% { transform: scale(1); }
}
/* 2.2–2.45s check swaps in */
@keyframes today_check {
  0%, 50% { opacity: 0; transform: scale(.25); filter: blur(4px); animation-timing-function: var(--ease-out-strong); }
  55.682%, 88.636% { opacity: 1; transform: scale(1); filter: blur(0); animation-timing-function: var(--ease-out-quint); }
  95.455%, 100% { opacity: 0; transform: scale(1); filter: blur(0); }
}
/* 2.25–2.45s row text dims to 50% */
@keyframes today_done {
  0%, 51.136% { opacity: 1; animation-timing-function: var(--ease-out-quint); }
  55.682%, 88.636% { opacity: .5; animation-timing-function: var(--ease-out-quint); }
  95.455%, 100% { opacity: 1; }
}
/* 2.35–2.6s "+12 XP" rises in; 2.6–3.2s keeps rising and fades */
@keyframes today_xp {
  0%, 53.409% { opacity: 0; transform: translateY(0); animation-timing-function: var(--ease-out-strong); }
  59.091% { opacity: 1; transform: translateY(-10px); animation-timing-function: var(--ease-out-strong); }
  72.727%, 100% { opacity: 0; transform: translateY(-28px); }
}
```

Every other illustration follows this exact pattern. Below are their layouts and storyboards. Convert each time to a percentage
with `t / D × 100`. "Reset" always means: back to the start state with `--ease-out-quint` over the stated window.

---

### `IlloWelcome` (step 0, D = 4.2s). Shown on the welcome plate (`aspect-[720/440]`; keep viewBox 720×460, it crops 10 units off the bottom with `preserveAspectRatio="xMidYMid slice"`)

`aria-label`: "A character card: six life areas fill up, the XP bar completes and the level rises from 3 to 4."

| Element | Geometry |
|---|---|
| Card | `rect x150 y40 w420 h370 rx28`, surface |
| Avatar capsule | `<g transform="rotate(-14 222 112)">`: `rect x196 y72 w52 h80 rx26`, fill `var(--surface)`, stroke `var(--ink)` 4. Inside it, a top-half `rect x198 y74 w48 h42`, fill `var(--pill)`, clipped to the capsule with a `<clipPath>` of the same rounded rect |
| Name / level | "Level" x280 y104 size 22 ink-3; numbers x280 y140 size 40 weight 700 tabular: `.w_lvOld` "3", `.w_lvNew` "4" |
| Area rows ×6 | y = 190, 222, 254, 286, 318, 350. Each: dot `circle cx186 r6` filled with its `var(--cat-*)` (health, mind, skills, wealth, hobbies, relationships), label x204 size 22 ink-2 (Health, Mind, Skills, Wealth, Hobbies, People), track `rect x330 w200 h12 rx6` `var(--i-bar)` at y−9, fill rect same geometry in the area colour with `.barL` and its own class `.w_bar1`…`.w_bar6`. Finished widths as scaleX: .82 .64 .9 .58 .72 .68 |
| XP bar | `rect x186 y378 w344 h14 rx7` `var(--i-bar)`, fill `var(--pill)` `.barL .w_xp` |
| +1 chip | `<Chip x={420} y={92} w={110} label="Level up" tone="pill" />`, class `.pop .w_chip` |

| Time (s) | Change |
|---|---|
| 0.3–1.1 | bars 1–6: scaleX .12 → finished, each 0.5s long, starting 0.3, 0.38, 0.46, 0.54, 0.62, 0.70 (80ms stagger), `--ease-out-strong` |
| 1.6–2.3 | XP fill: scaleX .62 → 1, `--ease-out-strong` |
| 2.3–2.55 | `.w_lvOld`: opacity 1→0, translateY 0→−14px. `.w_lvNew`: opacity 0→1, translateY 14px→0. `--ease-out-strong` |
| 2.3–2.4 | XP fill drops to scaleX .08 (the new level starts empty) |
| 2.45–2.7 | chip appears |
| 3.8–4.2 | reset everything (bars to .12, XP to .62, level back to 3, chip out). No cursor in this one. |

### `IlloLog` (step 2, D = 3.6s). Keyboard only, no cursor (the step is about typing)

`aria-label`: "The command menu: coffee 2 is typed, Enter is pressed, and a Logged chip appears."

| Element | Geometry |
|---|---|
| Menu panel | `rect x80 y60 w560 h300 rx24`, surface; divider `y138` |
| Search field | Lucide `Search` in a `<g>` at x112 y82 w28 h28, ink-3; typed text "coffee 2" x156 y108 size 30 ink |
| Type cover | `rect x152 y80 w150 h40` with fill `var(--surface)`, class `.lg_cover`, `transform-box: fill-box; transform-origin: 100% 50%`. Scaling it from 1 to 0 reveals the text |
| Caret | `rect x154 y84 w3 h32 rx1.5` fill `var(--pill)`, class `.lg_caret` (moves in step with the cover) |
| Result row | `<g .lg_row>`: `rect x100 y156 w520 h64 rx14` fill `var(--i-pill-fill)`; Lucide `Coffee` at x120 y172 w32 h32 color `var(--pill)`; "Log coffee" x168 y196 size 28 ink weight 600; "2 cups" x320 y196 size 28 ink-3; kbd `rect x560 y170 w40 h36 rx8` surface + "↵" centred, size 22, in `<g .pop .lg_key>` |
| Logged chip | `<Chip x={472} y={170} w={128} label="Logged" />` in `.pop .lg_chip` (sits where the kbd was) |
| Hint rows | two skeleton bars `rect x120 y250 w300 h14 rx7` and `x120 y290 w220 h14 rx7`, `var(--i-bar)` (static) |

| Time (s) | Change |
|---|---|
| 0.3–1.1 | `.lg_cover` scaleX 1→0 with `animation-timing-function: steps(8, end)` (8 characters typed). `.lg_caret` translateX 0→146px with the same `steps(8, end)` |
| 1.15–1.4 | `.lg_row` appears (opacity 0→1, translateY 6px→0, `--ease-out-strong`) |
| 1.7–1.8 / 1.8–2.05 | `.lg_key` press: scale 1→.88→1 |
| 2.05–2.3 | `.lg_key` opacity 1→0; `.lg_chip` appears |
| 2.05–2.2 | `.lg_caret` opacity 1→0 |
| 3.2–3.6 | reset: cover back to scaleX 1, caret back to 0 and visible, row, chip and key back to start |

Base (finished) state: cover `scaleX(0)`, caret `opacity: 0`, row visible, key `opacity: 0`, chip visible.

### `IlloProgress` (step 3, D = 4.4s)

`aria-label`: "A level ring fills and the level goes from 4 to 5, the streak goes from 12 to 13 days and a chest is earned."

| Element | Geometry |
|---|---|
| Card | `rect x60 y50 w600 h360 rx28`, surface |
| Level ring | track `circle cx210 cy200 r90` stroke `var(--i-bar)` 16, no fill. Progress: the same circle, stroke `var(--pill)` 16, `strokeLinecap="round"`, `pathLength={1}`, `strokeDasharray="1 1"`, `transform="rotate(-90 210 200)"`, class `.pg_ring` (animates `stroke-dashoffset`) |
| Level text | "LV" x210 y186 size 22 ink-3 centred; numbers x210 y232 size 52 weight 700 centred tabular: `.pg_lvOld` "4", `.pg_lvNew` "5" |
| Streak | Lucide `Flame` in `<g .pop .pg_flame>` at x360 y120 w40 h40 color `var(--cat-health)`; "Streak" x412 y136 size 22 ink-3; numbers x412 y170 size 34 weight 700 tabular `.pg_sOld` "12 days" / `.pg_sNew` "13 days" |
| Multiplier chip | `<Chip x={360} y={196} w={96} label="×1.3" tone="pill" />`, static |
| Chest row | Lucide `Gift` in `<g .pop .pg_gift>` at x360 y272 w40 h40 color `var(--cat-wealth)`; text "Chest earned" x412 y300 size 26 ink weight 600, class `.pg_giftT` |

| Time (s) | Change |
|---|---|
| 0.3–1.2 | `.pg_ring` stroke-dashoffset .3 → 0, `--ease-out-strong` |
| 1.2–1.45 | level swap 4→5 (old: opacity →0, y →−14px; new: from y 14px, opacity 0 → in) |
| 1.3–1.35 | ring dashoffset jumps to .94 (the new level starts almost empty), linear |
| 1.9–2.15 | streak swap 12→13 (same swap motion); `.pg_flame` scale 1 → 1.12 (1.9–2.05) → 1 (2.05–2.3), `--ease-out-strong` |
| 2.6–2.85 | `.pg_gift` icon swap in (scale .25→1, blur 4→0, opacity 0→1); `.pg_giftT` appears (opacity 0→1, translateX −6px→0) |
| 4.0–4.4 | reset (ring back to dashoffset .3, texts back, gift out) |

Base (finished): ring dashoffset .94, "5", "13 days", gift visible.

### `IlloAreas` (step 4, D = 4.0s)

`aria-label`: "Six area tiles. A cursor opens Health: its ring lights up and a small sleep trend draws in."

| Element | Geometry |
|---|---|
| Tiles ×6 | 3 columns × 2 rows, each `rect w192 h170 rx20` surface, at x = 48, 264, 480 and y = 48, 242 |
| Tile content | capsule mark: `<g transform="rotate(-14 cx cy)">` rect w30 h48 rx15 at tile x+24, y+24, fill `var(--surface)`, stroke `var(--ink)` 3, top half filled with the area colour (same clipPath technique as `IlloWelcome`); name at x+24 y+108 size 26 weight 600 ink; value at x+24 y+142 size 22 ink-3 tabular (Health "7.2h sleep", Mind "3 sessions", Skills "12 commits", Wealth "₹4.1k spent", Hobbies "2 hrs", People "4 calls") |
| Health highlight | `rect` same as Health tile, `fill="none"`, stroke `var(--cat-health)` 4, class `.ar_ring` |
| Sparkline | path in the Health tile, `M72 196 L104 184 L132 190 L164 170 L196 176 L220 160`, stroke `var(--cat-health)` 4, `strokeLinecap="round"`, `strokeLinejoin="round"`, `pathLength={1}`, `strokeDasharray="1 1"`, class `.ar_spark`. Move the Health value text up to y+90 and the name to y+66 so the line fits under them |
| Cursor | rest translate(600,420); target translate(150,140) |

| Time (s) | Change |
|---|---|
| 0.4–1.0 | cursor → Health |
| 1.05–1.15 / 1.15–1.4 | press |
| 1.15–1.4 | `.ar_ring` opacity 0→1, `--ease-out-quint` |
| 1.35–2.1 | `.ar_spark` stroke-dashoffset 1 → 0, `--ease-out-strong` |
| 2.6–3.2 | cursor → rest |
| 3.6–4.0 | reset (ring and spark out) |

### `IlloConnect` (step 5, D = 4.5s)

`aria-label`: "A list of apps. A cursor connects Zomato, a line links it to ReLife and an order flows in."

| Element | Geometry |
|---|---|
| List panel | `rect x40 y60 w380 h340 rx24`, surface. Rows at centre y = 130, 230, 330, dividers at y 180 and 280 |
| Rows | letter tile `rect x68 w52 h52 rx14`, fill `var(--surface-2)`, letter centred size 26 weight 700 ink ("G", "Z", "T"); name x136 size 28 ink weight 600 (GitHub, Zomato, Telegram); sub x136 (+30) size 20 ink-3 ("Commits", "Orders", "Reminders") |
| Row 1 and 3 state | static `<Chip label="Connected" w={132} x={268} />` vertically centred on the row |
| Row 2 button | `<g .ct_btn>`: `rect x284 y212 w116 h40 rx12` fill `var(--ink)` + "Connect" centred, size 20, weight 600, fill `var(--surface)`; `.ct_chip`: `<Chip x={268} y={212} w={132} label="Connected" />` |
| ReLife mark | capsule `<g .pop .ct_mark>` centred at 590,230: `rect x562 y186 w56 h88 rx28` with the same capsule style as `IlloWelcome`, top half `var(--pill)`, `rotate(-14 590 230)` |
| Link line | `path M420 230 H548`, stroke `var(--pill)` 4, round caps, `pathLength={1}`, `strokeDasharray="1 1"`, class `.ct_line` |
| Order dots ×3 | `circle cx420 cy230 r7` fill `var(--pill)`, classes `.ct_d1` `.ct_d2` `.ct_d3`, moving with translateX 0 → 128px |
| Order row | under the mark: `<g .ct_order>`: text "Food · ₹240" centred x590 y330 size 22 ink-2 tabular |
| Cursor | rest translate(600,420); target translate(342,236) |

| Time (s) | Change |
|---|---|
| 0.4–1.0 | cursor → Connect |
| 1.05–1.15 / 1.15–1.4 | press (also press `.ct_btn` itself: scale .96 → 1) |
| 1.3–1.55 | `.ct_btn` opacity → 0; `.ct_chip` appears |
| 1.45–2.0 | `.ct_line` dashoffset 1 → 0, `--ease-out-strong` |
| 2.0–2.6 / 2.12–2.72 / 2.24–2.84 | dots 1/2/3: opacity 0→1 over the first 0.1s, translateX 0 → 128px with `--ease-in-out-strong`, opacity → 0 over the last 0.1s |
| 2.9–3.05 / 3.05–3.3 | `.ct_mark` scale 1 → 1.06 → 1, `--ease-out-strong` |
| 3.0–3.25 | `.ct_order` appears (opacity, translateY 6px→0) |
| 2.2–2.8 | cursor → rest (it leaves while the dots travel) |
| 4.1–4.5 | reset (button back, chip, line, order out) |

### `IlloRemind` (step 6, D = 4.0s). A phone notification; a tap ripple instead of a cursor

`aria-label`: "A Telegram reminder for water slides in, Done is tapped and it turns into Logged, plus 5 XP."

| Element | Geometry |
|---|---|
| Phone edge (static, faint) | `rect x200 y20 w320 h520 rx48`, `fill="none"`, stroke `var(--i-line)` 3 (bottom crops off the plate) |
| Notification `<g .rm_card>` | `rect x224 y96 w272 h188 rx24` fill `var(--surface)`, stroke `var(--i-line)` 2. Header: capsule mini mark at x248 y116 (w18 h28 rx9, rotate −14) + "ReLife" x276 y136 size 20 ink-3 + "now" x472 y136 end size 20 ink-3. Lucide `Droplet` in `<g>` at x248 y156 w28 h28 color `var(--pill)`; "Water" x286 y178 size 26 weight 600 ink; "2 of 8 glasses" x286 y208 size 22 ink-2 tabular |
| Buttons | Done: `<g .rm_done>` `rect x248 y228 w108 h40 rx12` fill `var(--ink)` + "Done" in `var(--surface)` size 20 weight 600. Later: `rect x364 y228 w108 h40 rx12` fill `var(--surface-2)` + "Later" ink-2 |
| Done result | `<g .rm_ok>` (at the Done button's spot): `rect x248 y228 w224 h40 rx12` fill `var(--i-good-fill)`, Lucide `Check` (in a `<g .pop .rm_tick>`) at x320 y236 w24 h24 color `var(--good)` strokeWidth 3, text "Logged · +5 XP" x352 y254 size 20 weight 600 fill `var(--good)` |
| Tap ripple | `circle cx302 cy248 r26` fill `color-mix(in oklch, var(--ink) 18%, transparent)`, class `.pop .rm_tap` |

| Time (s) | Change |
|---|---|
| 0.2–0.6 | `.rm_card`: opacity 0→1, translateY −24px → 0, `--ease-out-strong` |
| 1.3–1.4 | `.rm_tap` opacity 0→1, scale .6→1 |
| 1.4–1.7 | `.rm_tap` opacity → 0, scale → 1.3, `--ease-out-strong` |
| 1.35–1.45 / 1.45–1.7 | `.rm_done` press: scale 1→.96→1 |
| 1.6–1.75 | `.rm_done` and the Later button: opacity → 0 |
| 1.65–1.9 | `.rm_ok` opacity 0→1; `.rm_tick` icon swap in (scale .25→1, blur 4→0) |
| 3.6–4.0 | `.rm_card` opacity → 0 and translateY → −24px (the card slides back up, so 100% = 0% with the card hidden); the other parts snap back at 3.95 while it is hidden |

Base (finished): card visible, Done and Later hidden, `.rm_ok` visible, tap `opacity: 0`.

---

## Repo conventions to follow

- CSS Modules are fine in the App Router; keyframes declared in a module are scoped automatically.
  Before you start, read `node_modules/next/dist/docs/` (search for "CSS Modules") to confirm nothing changed in Next 16.
- Lucide icons: `import { Check, Coffee, Droplet, Flame, Gift, Search } from 'lucide-react'`. Pass `x`, `y`, `width`, `height`, `color`, `strokeWidth`.
- No raw hex anywhere. Only the tokens listed above and `color-mix()` of tokens.
- Existing line-art SVG style for reference: `src/ui/components/line-art.tsx` (stroke 1.5, round caps; there the art is drawn at its real size, so strokes are thicker here because of the 0.42 scale).
- Capsule look: `src/ui/components/capsule-icon.tsx:18`. A pill tilted −14°, coloured top, white bottom, 2px ink outline. Copy the shape, not the component (it renders HTML, not SVG).

## Steps

1. Create `illo.module.css` with the shared block, then the `today_*` CSS above, verbatim.
2. Create `illo-kit.tsx` (above).
3. Create `illos.tsx` exporting `IlloWelcome`, `IlloToday`, `IlloLog`, `IlloProgress`, `IlloAreas`, `IlloConnect`, `IlloRemind`.
   Build `IlloToday` first, exactly as specified, and check it in the browser before writing the others.
4. For each remaining illustration, write its base (finished-frame) classes and keyframes from the storyboard, using
   `IlloToday`'s CSS as the template. Keep every animated class of one illustration on the same `D`.
5. Wire them into `src/ui/components/tour/steps.ts` (plan 019, step 3), replacing the `() => null` placeholders.
6. Add a gallery block to `src/app/dev/ui/page.tsx`: the seven illustrations in a grid, each in a `w-[304px] aspect-[720/460] rounded-md bg-surface-2` plate, so they can be checked side by side in light and dark.

## Boundaries

- Do NOT use GIF, video, Lottie, canvas or JS animation loops (no `requestAnimationFrame`, no Motion) inside the illustrations. CSS keyframes only.
- Do NOT add dependencies.
- Do NOT edit the tour shell's behaviour (plan 019) beyond swapping in the components.
- Do NOT use `prefers-color-scheme`. Themes follow `[data-theme]` through the CSS variables.
- If `var(--ease-*)` inside `@keyframes` doesn't apply in the browser (DevTools shows the segment as linear), STOP and report. Do not hand-type the curves.

## Verification

- **Mechanical**: `npm run typecheck`, `npm test`, `npm run build` pass. `grep -nE '#[0-9a-fA-F]{3,6}\b' src/ui/components/tour/` returns nothing.
- **Feel check** (`/dev/ui` and `/?tour` in `npm run dev:mock`):
  - Each loop reads as one small story: something happens, it settles, it holds, then it resets softly. No element pops or jumps at the loop seam (watch 3 loops in a row).
  - DevTools → Animations at 10%: the cursor eases out of rest and into its target with no linear glide. Presses dip to 0.88, never lower. Nothing scales up from 0.
  - Typing in `IlloLog` advances character by character (stepped), and the caret stays at the end of the text.
  - Light and dark: every panel, text and chip is readable. No white boxes in dark mode (that would mean a hard-coded colour).
  - Rendering → `prefers-reduced-motion: reduce`: each plate shows the finished frame (quest cleared, routine ticked, "Logged", level 5, and so on) with no cursor. Nothing moves.
  - At the card's real size (304px plate) every label is legible. Body text is about 12px; nothing is smaller than about 9px.
  - Performance → record 5s on the tour: no layout or paint storms; the work is composited transforms and opacity, plus the two short dash draws.
- **Done when**: all seven illustrations play in the tour and in `/dev/ui`, look right in light, dark and reduced motion, and pass the checks above.
