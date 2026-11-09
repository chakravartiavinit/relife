# Animation plans

From an `improve-animations` audit (Emil Kowalski's motion principles). Execute in order.

| # | Plan | Severity | Status |
|---|---|---|---|
| 001 | [Open and close ⌘K instantly](001-command-menu-no-animation.md) | HIGH | DONE |
| 002 | [Reduced motion: drop movement, keep fades](002-reduced-motion-keep-fades.md) | HIGH | DONE |
| 003 | [One set of easing tokens](003-motion-tokens.md) | LOW | DONE |
| 004 | [Entrance animations for every chart](004-chart-entrances.md) | MEDIUM | DONE |
| 005 | [Petals on level-up](005-level-up-celebration.md) | LOW | DONE |
| 006 | [Shorten the check-off celebration](006-check-off-timing.md) | MEDIUM | DONE |
| 007 | [Stop the endless chest wobble, close the chest modal fast](007-chest-wobble-and-exit.md) | LOW | DONE |
| 008 | [Level-up label: transform and opacity only](008-level-up-no-letterspacing.md) | LOW | DONE |
| 009 | [One set of easing constants in JS](009-shared-easing-constants.md) | LOW | DONE |
| 010 | [Petals drift at a constant speed](010-petals-linear.md) | LOW | DONE |
| 011 | [Compact region picker opens from its corner](011-picker-origin.md) | LOW | DONE |
| 012 | [Settings save bar: fade only under reduced motion](012-save-bar-reduced-motion.md) | LOW | DONE |
| 013 | [Roll the banner XP numbers](013-hud-xp-ticker.md) | LOW | DONE |
| 014 | [Fade in the all-done line and opened details](014-quiet-reveals.md) | LOW | DONE |
| 015 | [Training log bars grow in by week](015-training-log-bars.md) | LOW | DONE |
| 016 | [Sidebar redesign](016-sidebar-redesign.md) | MEDIUM | DONE |

Order: 003 before 004 (004 uses the new tokens). 002 before 004 (reduced-motion approach). 009 before 006 (006 imports EASE_OUT_STRONG). Others independent.

Second audit (after the ReLife capsule redesign): 006–014. Already right then: row menu, toasts, switch, connector dialog, medal banner, onboarding timing, nav and ⌘K colour-only changes, no `transition: all`, no `scale(0)`.

Already right, left alone: dither area/bar chart sweeps, beUI heat calendar spring stagger, agenda
check cross-fade (scale 0.25→1, blur 4px→0), dialog enter 200ms / exit 150ms, theme switch suppressing
transitions, button press scale(0.96) in 150ms, number tickers.
| 017 | [Extension popup redesign](017-extension-popup.md) | MEDIUM | DONE |
| 018 | Wealth pass: Portfolio share bars stagger 50ms per row (`reveal-fill`, reduced motion off), row hover colour 150ms | LOW | DONE |
| 019 | [Guided product tour: welcome modal, spotlight, step cards](019-product-tour.md) | MEDIUM | DONE |
| 020 | [Seven animated SVG tour illustrations](020-tour-illustrations.md) | MEDIUM | DONE |

Tour (019–020), modelled on https://kestrel-app-eta.vercel.app/runs?tour: run 019 first (020 plugs into its
`steps.ts`). Inside 020, build `IlloToday` first and check it in the browser before drawing the other six.
| 021 | Toasts: ReLife-owned Sonner-style stack in `toast.tsx` (newest in front, older ones peek 10px and shrink 5%, fan out on hover/focus; enter 16px up, auto-exit 12px down in 180ms, swipe exits the way it was flung; timers pause on hover and hidden tab). Payment burst grouped into one toast. Replaced the vendored beui `animated-toast-stack.tsx` | MEDIUM | DONE |
| 022 | Tour illustrations redrawn as cause → effect stories (5–5.6s loops): inputs feed XP into the character (Welcome), a System quest cleared by synced steps (Today), ⌘K keys → menu → new tracker (⌘K), XP × streak → level ring → chest (Progress), tile grows into its page (Areas), switch on → lock opens → data flows (Connectors), Telegram Done → counts in the app (Reminders). Soft SVG drop shadows; every loop seam checked frame-equal | MEDIUM | DONE |
