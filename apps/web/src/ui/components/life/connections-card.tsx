import Link from 'next/link'
import type { Connected } from '@/domain/life-status'
import { Card } from '../card'
import { buttonLinkClass } from '../button'
import { Connection } from '../connection'

/** "How they connect": up to two connections that cross areas (a change with its partner, a link), each with its two lines. */
export function ConnectionsCard({ items, today }: { items: Connected[]; today: string }) {
  if (!items.length) return null
  return (
    <Card aria-labelledby="connect-h">
      <header className="mb-4 flex items-start justify-between gap-4">
        <h2 id="connect-h" className="font-display text-heading text-ink">How they connect</h2>
        <Link href="/coach/patterns" className={buttonLinkClass('text-small', { target: true })}>More in Coach</Link>
      </header>
      <div className="flex flex-col gap-5">
        {items.map((c, i) => (
          <div key={i} className={i ? 'border-t border-divider pt-5' : undefined}>
            <Connection {...('link' in c ? { link: c.link } : { change: c.change })} today={today} spark />
          </div>
        ))}
      </div>
    </Card>
  )
}
