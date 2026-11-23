import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { AREAS, areaHref, type AreaKpi } from '@/core/areas'
import { hmSeconds } from '@/core/areas/time'
import type { ActivityKind } from '@/domain/activity'
import { CHART } from '../../tokens'
import { CapsuleIcon } from '../capsule-icon'
import { Card, Skeleton } from '../card'
import { PeekLink } from '../peek/peek-link'

export const TimeSkeleton = () => <Skeleton className="h-[370px] rounded-lg grid-md:h-[326px] grid-lg:h-[196px]" />

/** The biggest kind leads in Time's colour, the next two take the neutral ramp, the rest the lightest neutral. */
const shade = (rank: number) => (rank === 0 ? AREAS.time.color : CHART.neutral[Math.min(rank - 1, 2)])

/**
 * Time on the hub, a different block from the area rows: the week's laptop time as one stacked bar with its legend
 * under it, and today's numbers beside it (Today, Focus, Distraction, Most time on), each opening its Peek.
 */
export function TimeTile({ kinds, kpis, brief }: { kinds: { kind: ActivityKind; seconds: number }[]; kpis: AreaKpi[]; brief?: string }) {
  const def = AREAS.time
  const total = kinds.reduce((a, k) => a + k.seconds, 0)
  const shown = kinds.slice(0, 6)
  return (
    <Card as="article" aria-labelledby="time-h" className="flex flex-col gap-5 p-5 grid-md:px-6">
      <header className="flex items-start gap-3">
        <CapsuleIcon size="nav" color={def.color} icon={MonitorSmartphone} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 id="time-h"><Link href={areaHref(def)} className="rounded-xs text-heading text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">Time</Link></h2>
          <p className="text-body text-ink-2">
            {brief ?? def.description}
            {brief ? <>{' '}<PeekLink to={{ type: 'brief', id: 'time' }} className="rounded-xs font-medium whitespace-nowrap text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
          </p>
        </div>
      </header>
      {total ? (
        <div className="grid gap-x-8 gap-y-5 grid-lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <p className="mb-2 text-caption text-ink-3">Last 7 days on this Mac</p>
            <div role="img" aria-label={`Laptop time by kind, last 7 days: ${kinds.map((k) => `${k.kind} ${hmSeconds(k.seconds)}`).join(', ')}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {kinds.map((k, i) => <span key={k.kind} style={{ flexGrow: k.seconds, background: shade(i) }} className="min-w-1 first:rounded-s-full last:rounded-e-full" />)}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-small text-ink-2">
              {shown.map((k, i) => (
                <li key={k.kind} className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: shade(i) }} /><span className="capitalize">{k.kind}</span><span className="text-ink-3 tabular-nums">{hmSeconds(k.seconds)}</span></li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-divider grid-lg:border-s grid-lg:ps-8">
            {kpis.slice(0, 4).map((k) => (
              <div key={k.label} className="min-w-0">
                <PeekLink to={k.peek ?? { type: 'brief', id: 'time' }} className="-m-1 block rounded-md p-1 transition-colors duration-150 ease-out-quint hover-fine:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover-fine:bg-white/[0.05]">
                  <dt className="truncate text-caption text-ink-3">{k.label}</dt>
                  <dd title={k.value} className="num truncate text-heading text-ink">{k.value}</dd>
                </PeekLink>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="text-small text-ink-3">Nothing recorded yet. <Link href="/time" className="font-medium text-pill-ink hover-fine:underline">Set up the browser extension</Link> and your laptop time shows up here.</p>
      )}
    </Card>
  )
}
