import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadAreaKpis } from '@/core/areas'
import { getUser } from '@/core/user'
import { cn } from '../../cn'
import { PeekLink } from '../peek/peek-link'

/** Today, Focus and Distraction: the right side of Time's head, where the other areas have their level. Streams in under Suspense. */
export function TimeSummary() {
  return <Suspense fallback={<div className="h-[72px] w-full rounded-md bg-surface-2" />}><Numbers /></Suspense>
}

async function Numbers() {
  await connection()
  const items = (await loadAreaKpis(await getUser(), 'time')).slice(0, 3)
  if (!items.length) return null
  return (
    <dl className="grid grid-cols-3 divide-x divide-divider">
      {items.map((k) => (
        <div key={k.label} className="min-w-0 px-3 first:ps-0 last:pe-0">
          <dt className="truncate text-caption text-ink-3">{k.label}</dt>
          <dd className={cn('num mt-0.5 text-title', k.tone === 'good' ? 'text-good' : k.tone === 'bad' ? 'text-bad' : 'text-ink')}>
            {k.peek ? <PeekLink to={k.peek} className="rounded-xs focus-visible:outline-2 focus-visible:outline-pill">{k.value}</PeekLink> : k.value}
          </dd>
          {/* The tail of the line ("3h 59m a day on average"): the head's column is narrow. */}
          {k.sub ? <dd className="line-clamp-2 text-caption text-ink-3 tabular-nums">{k.sub.split(' · ').at(-1)}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
