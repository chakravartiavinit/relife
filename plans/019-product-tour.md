# 019 — Add a guided product tour (welcome modal, spotlight, step cards)

- **Status**: DONE (executed 2026-11-09; motion re-measured against Kestrel: spotlight 70% at ~120ms, 96% at ~220ms, same as Kestrel)
- **Commit**: 6330ed7 (motion values re-measured on Kestrel 2026-11-09; illustrations from plan 020 now exist, uncommitted)
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 4 new files (`src/ui/components/tour/`), small edits to `nav.tsx`, `command-menu.tsx`, `layout.tsx`, `onboarding-flow.tsx`, `globals.css`. About 250 lines plus the illustrations from plan 020.

## Problem

ReLife has no walkthrough. After `/welcome` the user lands on Today with a sidebar of 15 entries and
no explanation of quests, ⌘K logging, XP, areas or connectors. `src/ui/components/onboarding-flow.tsx:765`
links straight to `/`:

```tsx
// src/ui/components/onboarding-flow.tsx:765 — current
<a ref={go} href="/" className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}>
```

Reference: https://kestrel-app-eta.vercel.app/runs?tour. Its tour (measured in the browser) works like this:

1. A centred **welcome modal** (500px wide, 12px padding, radius 12) over a 32% black scrim. On top
   is an illustration plate (radius 8, `aspect-ratio: 720/440`, soft accent background with a dot
   texture fading in toward the bottom). Below it: a title, one paragraph, then **Show me around** (primary), **Skip**.
2. Then a **spotlight**: a fixed, pointer-transparent box over the target sidebar item, with a 1.5px
   accent ring, a 5px soft accent halo and `0 0 0 100vmax` scrim as box-shadows, so the rest of the page dims.
3. A **step card** (320px, radius 10, popover shadow) to the right of the target, with a 12px
   rotated-square arrow pointing at the target's vertical centre. Contents: an illustration plate
   (`aspect-ratio: 720/460`, 8px inset, radius 6), an `h3` (14px semibold), a paragraph, and a footer with
   **Maybe later**, **Next** (**Done** on the last step) and a tabular `1 of 4` count (`aria-live="polite"`).
   It has a close (×) button. The card is `role="dialog" aria-modal="false"`.
4. Between steps the card and the spotlight **glide** to the next target (Motion transform), and the
   card contents cross-fade.
5. Each illustration is an **inline SVG (viewBox 720×460) animated with CSS keyframes**: a small
   version of the real UI, a fake cursor that moves with `cubic-bezier(0.77,0,0.175,1)` and presses
   (scale 0.88), and elements that appear with opacity + scale 0.92→1 using `cubic-bezier(0.23,1,0.32,1)`.
   Loops run 2.6–4.5s and repeat forever. Under reduced motion, animations turn off and the finished frame shows.

This plan builds the shell (modal, spotlight, card, steps, triggers). Plan 020 draws the seven illustrations.

## Target

### Steps (copy is final; use it verbatim)

| # | Anchor (`data-tour`) | Title | Body | Illustration (plan 020) |
|---|---|---|---|---|
| 0 | none (centred modal) | Welcome to ReLife | ReLife turns your days into a character you level up. Check things off, let your apps log the rest, and watch your stats grow. A one-minute tour shows the six things you'll use most. | `IlloWelcome` |
| 1 | `/` (nav row Today) | Clear today's quests | Today lists what's due now. The System adds daily quests from your own numbers, and synced steps or sleep clear them on their own. | `IlloToday` |
| 2 | `command` (⌘K button) | Log anything in two words | Press ⌘K and type what you did, like "coffee 2". Something new gets its own tracker the first time you log it. | `IlloLog` |
| 3 | `/profile` (nav row Progress) | Watch your character grow | Every check-off earns XP. Keep your streak going for up to ×1.5 XP, open chests and unlock achievements. | `IlloProgress` |
| 4 | `areas` (the Areas nav group) | Six areas of your life | Health, Mind, Skills, Wealth, Hobbies and People each get a page with their own numbers and trends. | `IlloAreas` |
| 5 | `/connectors` (setup tile) | Let your apps do the logging | Connect GitHub, Binance, order apps and more. Synced data earns full XP, and nothing syncs until you connect it. | `IlloConnect` |
| 6 | `/settings` (setup tile) | Reminders that wait for a tap | ReLife can nudge you on Telegram. Tap Done there and it counts here. Quiet hours and limits live in Settings. | `IlloRemind` |

Welcome buttons: **Show me around** (primary), **Skip** (ghost). Step footer: **Skip tour** (ghost), **Next** /
**Done** (primary), count `{n} of 6`.

### Motion values (measured on Kestrel frame by frame, mapped to ReLife tokens in `src/ui/beui/lib/ease.ts`)

| What | Kestrel (measured) | ReLife value |
|---|---|---|
| Welcome modal enter | centred, opacity + scale | `opacity 0→1`, `scale 0.96→1`, 200ms `EASE_OUT_STRONG`, `transform-origin: center` |
| Welcome → tour | modal and scrim fade out in ~150ms (modal to `scale(0.98)`); card and spotlight fade in over ~300ms, card from `scale(0.96)` | modal exit `opacity → 0`, `scale → 0.98`, 150ms `EASE_OUT`; scrim `opacity → 0` 150ms `EASE_OUT`. Spotlight `opacity 0→1` 300ms `EASE_OUT_STRONG` (it does not move in; it appears in place). Card `opacity 0→1`, `scale 0.96→1`, 300ms `EASE_OUT_STRONG` |
| Card transform origin | centre | **Improve on Kestrel:** origin at the arrow tip, `transform-origin: 0 ${arrowTop + 6}px`, so the card grows out of the item it points at |
| Next / Back: spotlight | slides **and resizes** to the new item (translate + width/height), settles in ~300ms, no overshoot | `x`, `y`, `width`, `height` with `SPRING_LAYOUT` (stiffness 360, damping 32, mass 0.6: critically damped, settles in ~300ms) |
| Next / Back: card | keeps its x; only `y` glides, same timing as the spotlight | `y` with `SPRING_LAYOUT`. `x` is fixed for the whole tour (see Steps) |
| Next / Back: arrow | its `top` glides with the card | animate `top` with the same `SPRING_LAYOUT` (`motion.span`) |
| Card contents swap | old contents slide 10px left and fade while the new ones come in from 10px right, simultaneously, ~200ms | `AnimatePresence mode="popLayout" initial={false} custom={dir}`: enter `x: 10*dir → 0`, `opacity 0→1`; exit `x → -10*dir`, `opacity → 0`; 200ms `EASE_OUT_STRONG`. `dir` = 1 for Next, -1 for Back |
| Close (Skip, ×, Esc, Done) | fade | card + spotlight `opacity → 0`, card `scale → 0.98`, 150ms `EASE_OUT` (exit faster than enter) |
| Buttons | press | the existing `buttonClass` (already presses to `scale(0.96)`) |
| Reduced motion | — | `AppMotion` (`src/ui/components/motion-config.tsx`) sets `reducedMotion="user"`: Motion drops transforms and keeps fades. The illustrations already show their finished frame. Nothing extra. |

The spotlight animates `width`/`height`. That's fine: it is one fixed element with no children, and `scale` would
distort its ring. Never animate `top`/`left` on the card or spotlight; use `x`/`y`.

### Tokens to add (`src/app/globals.css`)

```css
/* in :root (light) */
--scrim: oklch(0.178 0 0 / 0.32);
/* in [data-theme="dark"] */
--scrim: oklch(0 0 0 / 0.55);
```

## Repo conventions to follow

- Easing and springs: import `EASE_OUT`, `EASE_OUT_STRONG`, `SPRING_LAYOUT` from `@/ui/beui/lib/ease`. Never retype curves.
- Motion import: `import { motion, AnimatePresence } from 'motion/react'` (exemplar: `src/ui/components/onboarding-flow.tsx`, the "all set" card at ~line 750).
- Window events for global UI: `relife:command` opens ⌘K (`src/ui/components/command-menu.tsx:200`). Use `relife:tour` the same way.
- Tokens only: `bg-surface`, `bg-surface-2`, `text-ink`, `text-ink-2`, `text-ink-3`, `var(--pill)`, `shadow-3`. No raw hex.
- Concentric radius: card radius 20 (`rounded-lg`) with 8px plate inset, so the plate radius is 12 (`rounded-md`).
- The dotted plate texture: use the existing `.halftone` class (`src/app/globals.css:315`) on the **welcome** plate only (it acts as a header). No dot texture on step cards.
- Lucide icons: stroke 1.5 next to regular text, 2 next to semibold.

## Steps

1. **Anchors.** Add `data-tour` attributes. No other markup changes.
   - `src/ui/components/nav.tsx`, `NavRow`'s `<Link>` (line ~89): add `data-tour={item.href}`.
   - `src/ui/components/nav.tsx`, `NavView` group wrapper (line ~75): `<div key={gi} data-tour={group.label === 'Areas' ? 'areas' : undefined} className="flex flex-col gap-0.5">`.
   - `src/ui/components/nav.tsx`, `SystemNavView`'s `<Link>` (line ~158): add `data-tour={href}`.
   - `src/ui/components/command-menu.tsx`, `CommandButton`'s `<button>` (line 198): add `data-tour="command"`.

2. **Scrim token.** Add `--scrim` as above. Change `src/ui/components/command-menu.tsx:76` `bg-[oklch(0.178_0_0/0.32)]` to `bg-[var(--scrim)]` (same light value, now themed).

3. **`src/ui/components/tour/steps.ts`.** Export `TOUR_STEPS: { anchor: string | null; title: string; body: string; Illo: () => React.JSX.Element }[]`, the 7 rows of the table above, in order.
   The illustrations already exist (plan 020, DONE): import `IlloWelcome`, `IlloToday`, `IlloLog`, `IlloProgress`,
   `IlloAreas`, `IlloConnect`, `IlloRemind` from `./illos`. Don't change `illos.tsx` or `illo-kit.tsx`.

4. **`src/ui/components/tour/tour.tsx`** (`'use client'`), exporting `Tour`:
   - State: `step: number | null` (`null` = closed, `0` = welcome).
   - Open: in a mount `useEffect`, if `new URLSearchParams(location.search).has('tour')`, set `step = 0`.
     Also listen for `window` event `relife:tour` and set `step = 0`. Do **not** use `useSearchParams`
     (it would need a Suspense boundary in the layout under Cache Components).
   - Close: `step = null`, then `history.replaceState(null, '', location.pathname + location.search.replace(/[?&]tour(=[^&]*)?/, '').replace(/^&/, '?') + location.hash)` so a refresh does not reopen it.
   - Target rect: `const el = anchor ? document.querySelector(`[data-tour="${anchor}"]`) : null`.
     If `el` is missing or `el.getClientRects().length === 0` (the sidebar is `hidden` below `lg`),
     use **no-anchor layout**: no spotlight; card fixed, centred horizontally, `bottom: 96px` (clears
     the TabBar), `width: min(320px, calc(100vw - 24px))`, no arrow.
     Otherwise call `el.scrollIntoView({ block: 'nearest' })`, then read `getBoundingClientRect()`. Re-measure on `resize` and on the nav
     scroller's `scroll` (`capture: true` on `window`), throttled with `requestAnimationFrame`.
   - Spotlight (`motion.div`, `fixed left-0 top-0 pointer-events-none z-[70] rounded-md`):
     `initial={{ opacity: 0 }}` and on its first render jump straight to the target rect (no glide from 0,0: pass the
     first rect as `initial` too). Then `animate={{ x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8, opacity: 1 }}`,
     `transition={{ ...SPRING_LAYOUT, opacity: { duration: 0.3, ease: EASE_OUT_STRONG } }}`,
     `style={{ boxShadow: '0 0 0 1.5px var(--pill), 0 0 0 5px color-mix(in oklch, var(--pill) 22%, transparent), 0 0 0 100vmax var(--scrim)' }}`.
   - Card (`motion.div role="dialog" aria-modal="false" aria-labelledby="tour-t" aria-describedby="tour-d" tabIndex={-1}`,
     `fixed left-0 top-0 z-[71] w-[320px] rounded-lg bg-surface shadow-3 outline-none`):
     `x = asideRight + 12`, where `asideRight = document.querySelector('aside')!.getBoundingClientRect().right` (the
     sidebar `<aside>` in `layout.tsx`, 264px wide). This keeps the card at one x for the whole tour, as Kestrel does,
     and stops it covering the sidebar. `y = clamp(r.top + r.height / 2 - 72, 12, innerHeight - cardHeight - 12)`
     (measure `cardHeight` with a ref + `ResizeObserver`). `y` uses `SPRING_LAYOUT`. First show: `initial={{ opacity: 0, scale: 0.96 }}` at the target y, `animate={{ opacity: 1, scale: 1 }}` over 300ms `EASE_OUT_STRONG`, `style={{ transformOrigin: `0 ${arrowTop + 6}px` }}`. Exit: `opacity 0`, `scale 0.98`, 150ms `EASE_OUT`.
   - Arrow: `<motion.span aria-hidden className="absolute -left-1.5 size-3 rotate-45 rounded-[2px] bg-surface" style={{ boxShadow: '-1px 1px 0 var(--divider)' }} animate={{ top: arrowTop }} transition={SPRING_LAYOUT} />`
     with `arrowTop = clamp(r.top + r.height / 2 - y - 6, 16, cardHeight - 28)`. The arrow sits on the card's left edge,
     and the gap between the spotlight and the card is the space between the item and the sidebar edge. That is expected:
     the arrow points across it.
   - Card body, inside `<AnimatePresence mode="popLayout" initial={false} custom={dir}>` keyed by `step`
     (`dir` is 1 after Next, -1 after Back; keep it in state next to `step`):
     ```tsx
     const slide = {
       enter: (d: number) => ({ x: 10 * d, opacity: 0 }),
       center: { x: 0, opacity: 1 },
       exit: (d: number) => ({ x: -10 * d, opacity: 0 }),
     }
     <motion.div key={step} custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
       transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}>
       <div className="mx-2 mt-2 aspect-[720/460] overflow-hidden rounded-md bg-surface-2"><Illo /></div>
       <div className="px-4 pt-3.5 pr-11">
         <h3 id="tour-t" className="text-[14px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>
         <p id="tour-d" className="mt-1 text-[13.5px] leading-relaxed text-pretty text-ink-2">{body}</p>
       </div>
     </motion.div>
     ```
     Footer (outside the keyed part so buttons don't flash): `flex items-center gap-1.5 px-4 py-3.5`,
     **Skip tour** (`buttonClass({ variant: 'ghost', size: 'md' })`), **Next**/**Done**
     (`buttonClass({ variant: 'primary', size: 'md' })`), then `<span aria-live="polite" className="ms-auto text-[12px] text-ink-3 tabular-nums">{step} of 6</span>`.
     Close button: Lucide `X` (stroke 1.5) in a 40×40 hit area, `absolute right-2` with its top aligned
     to the plate's bottom edge + 6px (`top: calc((320px - 16px) * 460 / 720 + 14px)`), `aria-label="Close the tour"`.
   - Welcome (step 0): scrim `motion.div fixed inset-0 z-[70] bg-[var(--scrim)]`; centred wrapper
     `fixed inset-0 z-[71] grid place-items-center p-4 pointer-events-none`; modal `motion.div role="dialog" aria-modal="true" aria-labelledby="welcome-t"`
     `pointer-events-auto w-[min(500px,100%)] rounded-lg bg-surface p-3 shadow-3` with the enter/exit values from the table.
     Plate: `relative aspect-[720/440] overflow-hidden rounded-md bg-[color-mix(in_oklch,var(--pill)_10%,var(--surface))]` containing a
     `<div aria-hidden className="halftone absolute inset-0 [mask-image:linear-gradient(transparent_55%,black)]" />` and `<IlloWelcome />`.
     Below: `px-3 pt-4 pb-2`, `h2#welcome-t` (17px semibold, `tracking-[-0.01em]`), paragraph (`text-[14px] text-ink-2 mt-1.5`),
     buttons row `mt-5 flex gap-2`.
   - Keyboard (listen on `window` only while open): `Escape` closes; `ArrowRight` = Next; `ArrowLeft` = previous
     step (not below 1). On every step change, `cardRef.current?.focus({ preventScroll: true })`. On open of the welcome, focus **Show me around**.
   - The welcome modal and the step card render under `AnimatePresence` so exits play.

5. **Mount it.** `src/app/layout.tsx`: import `Tour` and render `<Tour />` right after `<CommandMenu />` (line ~95).

6. **Entry points.**
   - `src/ui/components/onboarding-flow.tsx:765`: change `href="/"` to `href="/?tour"`. It is a plain `<a>`, so it is a full load and the mount effect sees `?tour`.
   - Replay: the user can open `/?tour` at any time. Don't add a ⌘K or Settings entry in this plan.

## Boundaries

- Do NOT edit `src/ui/beui/` or `src/components/evilcharts/`.
- Do NOT change nav styling or behaviour. The only nav change is the `data-tour` attributes.
- Do NOT add dependencies (no react-joyride, driver.js or shepherd). Motion is already installed.
- Do NOT store tour state in the DB or localStorage. The tour opens only through `?tour` or `relife:tour`.
- If `onboarding-flow.tsx:765`, `nav.tsx` or `command-menu.tsx:198` don't match the excerpts (drift since 6330ed7), STOP and report.

## Verification

- **Mechanical**: `npm run typecheck` and `npm test` pass. `npm run build` succeeds (Cache Components must not complain about the layout).
- **Feel check** (`npm run dev:mock`, open `http://127.0.0.1:3001/?tour` at 1440×900):
  - The welcome modal grows in from 96% at the centre, never from the corner. Skip fades it out in under 150ms.
  - **Show me around** fades in the spotlight on Today and the card beside it. The arrow points at the row's centre.
  - Press Next quickly 4 times. The card and ring glide and retarget mid-flight without snapping back. Old contents slide out to the left as new ones slide in from the right (Back reverses this), and they never stack.
  - The Areas step rings the whole group. The card stays fully on screen (it is clamped).
  - Step 5/6 target the small Setup tiles near the bottom. The card's bottom edge stays 12px above the window edge and the arrow still points at the tile.
  - DevTools → Animations at 10%: the spring settles without visible overshoot past the target. Contents fade in only after the old ones fade out.
  - Rendering → `prefers-reduced-motion: reduce`: the card and ring jump to place and the contents fade.
  - Resize to 800px wide: no spotlight; the card sits centred above the tab bar.
  - Light and dark (`data-theme`): the scrim, ring and card read well in both.
  - Keyboard only: Esc closes, ← and → step, Tab moves through Skip tour → Next → close, and focus is visible.
  - After closing, the URL no longer has `?tour`, and a refresh does not reopen the tour.
- **Done when**: all 7 stops play from `/?tour`, the welcome flow's **Go to Today** starts the tour, and the checks above pass in light and dark.
