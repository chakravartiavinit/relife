# 016 · Sidebar: fit the panel, slide sub-pages, XP in the profile

Status: DONE · base commit 7c8f449

## Problem
- At 900px tall the nav overflowed and Hobbies/People were cut off with no scroll cue.
- Inbox, Connectors and Settings took three full 36px rows.
- Wealth's sub-pages mounted on navigation and pushed every row below down in one frame.
- The profile showed the level but not progress to the next one.

## Change
- `src/ui/components/nav.tsx`: sub-pages always render inside `.nav-sub` (grid `0fr → 1fr`,
  `inert` while closed). Setup links became a 3-column row of 52px labelled tiles with a count
  badge, press `scale(0.96)` in 150ms `var(--ease-out-quint)`. "Areas" uses `SystemLabel`.
- `src/app/globals.css`: `.nav-sub` transitions `grid-template-rows 220ms var(--ease-out-strong)`
  and `opacity 150ms var(--ease-out-quint)`; reduced motion keeps only the fade. `.scroll-fade`
  masks the nav's top 10px and bottom 28px.
- `src/ui/components/sidebar-profile.tsx`: card (radius 12 inside the 24px panel's 12px padding)
  with LV, a `Capsule` XP bar and "N XP to go"; press `scale(0.98)`.

## Why these values
Sub-page reveal is on-screen movement of the rows below, triggered a few times a day: a
transition (interruptible if you click away mid-open), under 300ms, strong ease-out. Nav rows
themselves stay colour-only (tens of clicks a day). No sliding active pill for the same reason.

## Verify
Light and dark at 1440×900: all areas visible without scrolling; Wealth → Health collapses the
sub-pages smoothly; with reduced motion on, they fade without the height slide.
