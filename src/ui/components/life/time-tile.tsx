import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { AREAS, areaHref, type AreaKpi } from '@/core/areas'
import { hmSeconds } from '@/core/areas/time'
import type { ActivityKind } from '@/domain/activity'
import { KIND_COLOR } from '../../activity-colors'
import { CapsuleIcon } from '../capsule-icon'
import { Card } from '../card'
import { PeekLink } from '../peek/peek-link'

/** Time on the hub: the week's laptop time split by kind (one bar, a legend) and the four numbers of the page. */
export function TimeTile({ kinds, kpis, brief }: { kinds: { kind: ActivityKind; seconds: number }[]; kpis: AreaKpi[]; brief?: string }) {
  const def = AREAS.time
  const total = kinds.reduce((a, k) => a + k.seconds, 0)
  return (
    <Card as="article" className="flex flex-col gap-4 p-5 md:col-span-2 lg:col-span-3">
      <header className="flex items-start gap-3">
        <CapsuleIcon size="sm" color={def.color} icon={MonitorSmartphone} />
        <div className="min-w-0 flex-1">
          <Link href={areaHref(def)} className="rounded-xs text-heading text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">Time</Link>
          <p className="line-clamp-2 text-body text-ink-2">
            {brief ?? def.description}
            {brief ? <>{' '}<PeekLink to={{ type: 'brief', id: 'time' }} className="rounded-xs font-semibold whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
          </p>
        </div>
      </header>
      {total ? (
        <>
          <div role="img" aria-label={`Laptop time by kind, last 7 days: ${kinds.map((k) => `${k.kind} ${hmSeconds(k.seconds)}`).join(', ')}`} className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {kinds.map((k) => <span key={k.kind} style={{ flexGrow: k.seconds, background: KIND_COLOR[k.kind] }} className="min-w-1 first:rounded-s-full last:rounded-e-full" />)}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
            {kinds.slice(0, 6).map((k) => (
              <li key={k.kind} className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: KIND_COLOR[k.kind] }} /><span className="capitalize">{k.kind}</span><span className="text-ink-3 tabular-nums">{hmSeconds(k.seconds)}</span></li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.slice(0, 4).map((k) => (
              <div key={k.label} className="min-w-0">
                <PeekLink to={k.peek ?? { type: 'brief', id: 'time' }} className="-m-1 block rounded-md p-1 transition-colors duration-150 ease-out-quint hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]">
                  <dt className="line-clamp-2 text-caption text-ink-3">{k.label}</dt>
                  <dd className="num truncate text-heading text-ink">{k.value}</dd>
                </PeekLink>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-small text-ink-3">Nothing recorded yet. <Link href="/time" className="font-semibold text-pill-ink hover:underline">Set up the browser extension</Link> and your laptop time shows up here.</p>
      )}
    </Card>
  )
}
