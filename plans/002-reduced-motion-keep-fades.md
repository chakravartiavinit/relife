# 002 — Reduced motion: drop movement, keep fades

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 3 files

## Problem

```css
/* src/app/globals.css:240 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
```

1. It removes ALL feedback, including colour/opacity transitions that aid comprehension. Reduced motion
   means fewer, gentler animations, not zero.
2. It does nothing for Motion (`motion/react`) animations (agenda rows, toasts, modals), which keep moving.

## Target

- CSS: no blanket rule. Keyframe entrances that move (`.rise`) become a fade under reduced motion;
  chart reveals (plan 004) disable themselves under reduced motion.
- Motion: `<MotionConfig reducedMotion="user">` around the app, so transform/layout animations are
  skipped and opacity is kept for users who ask for reduced motion.

## Steps

1. `src/app/globals.css`: replace the blanket block with
   ```css
   @keyframes relife-fade { from { opacity: 0; } to { opacity: 1; } }
   @media (prefers-reduced-motion: reduce) {
     .rise { animation-name: relife-fade; }
     .animate-pulse { animation: none; }
   }
   ```
2. New `src/ui/components/motion-config.tsx` (`'use client'`) exporting
   `AppMotion({ children })` → `<MotionConfig reducedMotion="user">{children}</MotionConfig>`.
3. `src/app/layout.tsx`: wrap the `<ToastProvider>` children in `<AppMotion>`.

## Boundaries

- Do NOT edit vendored `src/ui/beui/` or `src/ui/dither-kit/` (both already check reduced motion).

## Verification

- **Mechanical**: typecheck passes.
- **Feel check**: DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Profile hero fades
  without rising; ticking a task still cross-fades the check; hover colours still transition.
