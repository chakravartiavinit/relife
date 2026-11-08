# 003 — One set of easing tokens

- **Status**: DONE
- **Commit**: 7c8f449
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: globals.css + ~6 components, find-and-replace

## Problem

The repo's curve is `--ease-out-quint: cubic-bezier(0.2, 0, 0, 1)` (src/app/globals.css:186), but
components hand-type it as `ease-[cubic-bezier(0.2,0,0,1)]` (e.g. src/ui/components/life-kpis.tsx:170,
src/ui/components/agenda.tsx:125) and `.rise` hard-codes it. Charts have no token at all.

## Target

```css
/* @theme in src/app/globals.css */
--ease-out-quint: cubic-bezier(0.2, 0, 0, 1);       /* UI state changes (existing) */
--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1);  /* entrances and chart reveals */
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1); /* on-screen movement */
```
Every `ease-[cubic-bezier(0.2,0,0,1)]` in `src/app` and `src/ui/components` becomes `ease-out-quint`;
`.rise` uses `var(--ease-out-strong)` with a 60ms stagger (was 100ms; stagger belongs at 30–80ms).

## Boundaries

- Do NOT touch vendored folders. Values only; no behaviour changes.

## Verification

- `grep -rn "cubic-bezier(0.2,0,0,1)" src/app src/ui/components` returns nothing. Typecheck passes.
