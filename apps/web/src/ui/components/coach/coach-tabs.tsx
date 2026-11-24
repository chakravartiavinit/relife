import { RouteTabs } from '../segment-tabs'

const count = (n?: number) => (n ? <span className="ml-1.5 text-small font-normal text-ink-3 tabular-nums">{n}</span> : null)

/** Needs you · Patterns · History, the underline tab row of the Coach head (`coach/layout.tsx`), with what is waiting. */
export function CoachTabs({ counts }: { counts?: { needs: number; patterns: number } }) {
  return (
    <RouteTabs
      variant="underline" label="Coach"
      tabs={[
        { href: '/coach', label: <>Needs you{count(counts?.needs)}</> },
        { href: '/coach/patterns', label: <>Patterns{count(counts?.patterns)}</> },
        { href: '/coach/history', label: 'History' },
      ]}
    />
  )
}
