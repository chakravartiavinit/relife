# 001 — Open and close the ⌘K command menu instantly

- **Status**: DONE
- **Commit**: 7c8f449 (plus uncommitted work in the tree)
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, ~15 lines

## Problem

The command menu is the most-used surface in the app (logging "water 250", jumping pages), opened by
keyboard dozens of times a day. It fades its backdrop and slides/scales its panel in and out:

```tsx
// src/ui/components/command-menu.tsx:41-55 — current
<AnimatePresence initial={false}>
  {open ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
      <motion.div className="absolute inset-0 bg-[oklch(0.178_0_0/0.28)] backdrop-blur-[2px]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }} onClick={close} />
      <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        className="relative w-full max-w-[560px]">
```

Keyboard-initiated, 100+/day actions should not animate (Raycast's palette has none).

## Target

Plain `div`s, no `AnimatePresence`, no `motion`. The menu appears and disappears on the same frame.

## Steps

1. Replace the two `motion.div` with `div` (keep `className` and `onClick`), drop `initial/animate/exit/transition`.
2. Replace `<AnimatePresence initial={false}>{open ? (…) : null}</AnimatePresence>` with `{open ? (…) : null}`.
3. Remove `AnimatePresence, motion` from the `motion/react` import if unused.

## Boundaries

- Do NOT change cmdk behaviour, items or styles. Motion only.

## Verification

- **Mechanical**: `npm run typecheck` passes.
- **Feel check**: press ⌘K repeatedly — the menu snaps open and shut, never mid-fade.
- **Done when**: no `motion`/`AnimatePresence` remain in command-menu.tsx.
