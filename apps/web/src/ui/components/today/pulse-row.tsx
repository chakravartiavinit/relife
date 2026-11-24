import Link from 'next/link'
import type { PulseTile } from '@/core/pulse'
import { Card } from '../card'
import { buttonLinkClass } from '../button'
import { StatusRow } from '../status-row'
import { CaptureRow } from './capture-row'

/**
 * Life pulse: one status row per area (and Time) with the area's picture, its key number in the line and a status
 * word; a row opens the area's Peek, one with nothing logged says so and opens Capture. Above them goes the week's
 * biggest change as a `Connection` (`connection`, drawn by the page from `findChanges`; nothing when none qualifies).
 * Two columns from 640px of page, one on a phone. Wealth is not here: Money today has it.
 */
export function PulseCard({ tiles, connection, className }: { tiles: PulseTile[]; connection?: React.ReactNode; className?: string }) {
  return (
    <Card aria-labelledby="life-pulse" className={className}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <h2 id="life-pulse" className="font-display text-heading text-ink">Life pulse</h2>
        <Link href="/life" className={buttonLinkClass('text-small', { target: true })}>Open Life</Link>
      </header>
      {connection ? <div className="mb-3 rounded-lg bg-surface-2 p-4">{connection}</div> : null}
      <ul className="grid grid-cols-1 gap-x-10 grid-md:grid-cols-2">
        {tiles.map((t) => {
          const line = `${t.value}${t.sub ? ` · ${t.sub}` : ''}`
          const picture = { of: 'area', to: t.slug } as const
          // A divider above every row but the first of each column.
          return (
            <li key={t.slug} className="min-w-0 not-first:border-t not-first:border-divider grid-md:[&:nth-child(2)]:border-t-0">
              {t.action ? <CaptureRow picture={picture} name={t.measure} line={line} status={t.status} /> : <StatusRow picture={picture} name={t.measure} line={line} status={t.status} peek={t.peek} />}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
