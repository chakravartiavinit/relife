# dither-kit (vendored)

Source: https://tripwire.sh/dither-kit (github.com/Boring-Software-Inc/dither-kit), MIT per its package.json.
Copied from the `core`, `area-chart` and `bar-chart` registry items. App code imports it through `src/ui/components/charts.tsx` only.

Local patches (re-apply after updating):

- `palette.ts`: ReLife seeds `health`, `mind`, `skills`, `wealth`, `relationships`, `pill` (category tokens converted from OKLCH).
- `scales.ts`, `chart-context.tsx`, `cartesian-root.tsx`: optional `yDomain` prop (clamped), so scale trackers like mood 1–5 keep their range.
- `tooltip.tsx`: ReLife surface and shadow instead of border and popover colours.
