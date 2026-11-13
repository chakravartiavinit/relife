import Link from 'next/link'
import type { Category } from '@/db/schema'
import { areaHref, areaOfCategory } from '@/core/areas'
import { BALANCE_XP } from '@/core/xp'
import type { Week } from '@/domain/life-week'
import { formatNumber } from '@/domain/money'
import { Card, CardHeader } from '../card'
import { PeekLink } from '../peek/peek-link'
import type { PeekRef } from '@/domain/peek'

type Change = { text: string; peek?: PeekRef } | null
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * "This week, area by area": Monday to Sunday dots, how many days earned XP, the area's biggest change in
 * words, the week's XP against the same days of last week. A phone shows each area as a stacked row.
 */
export function WeekTable({ week, changes, show }: { week: Week; changes: Record<string, Change>; show: string[] }) {
  const max = Math.max(1, ...week.rows.filter((r) => show.includes(r.area)).map((r) => r.xp))
  const hitAll = week.areaCount > 0 && week.areasHit === week.areaCount
  return (
    <Card className="p-5">
      <CardHeader title="This week, area by area" description={`Monday to Sunday. Deltas compare with the same days of last week.`} />
      <ul className="mt-3 divide-y divide-hairline">
        {week.rows.filter((r) => show.includes(r.area)).map((r) => {
          const def = areaOfCategory(r.area as Category)
          const change = changes[r.area]
          return (
            <li key={r.area} className="grid gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[7rem_auto_minmax(0,1fr)_9rem] sm:items-center">
              <Link href={areaHref(def)} className="rounded-xs text-body font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">{def.title}</Link>
              <div className="flex items-center gap-1.5" role="img" aria-label={`${r.activeDays} of ${r.elapsed} days active`}>
                {r.marks.map((m, i) => (
                  <span key={i} title={DAYS[i]} className={`size-2.5 rounded-full ${m === 'future' ? 'border border-hairline' : m === 'idle' ? 'bg-ink/15' : ''}`} style={m === 'active' ? { background: def.color } : undefined} />
                ))}
                <span className="ms-1 text-caption text-ink-3 tabular-nums">{r.activeDays}/{r.elapsed}</span>
              </div>
              <p className="min-w-0 truncate text-small text-ink-2">
                {change ? (change.peek ? <PeekLink to={change.peek} className="rounded-xs hover:underline focus-visible:outline-2 focus-visible:outline-pill">{change.text}</PeekLink> : change.text) : <span className="text-ink-3">Steady</span>}
              </p>
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 min-w-0 flex-1 rounded-full bg-ink/[0.06] dark:bg-white/[0.08]"><span className="block h-full rounded-full" style={{ width: `${(r.xp / max) * 100}%`, background: def.color }} /></span>
                <span className="num w-14 text-end text-small text-ink">{formatNumber(r.xp)}</span>
                {r.delta == null ? <span className="w-10 text-end text-caption text-ink-3">new</span> : Math.round(Math.abs(r.delta) * 100) === 0 ? <span className="w-10 text-end text-caption text-ink-3">flat</span> : <span className={`w-10 text-end text-caption tabular-nums ${r.delta > 0 ? 'text-good' : 'text-bad'}`}>{r.delta > 0 ? '+' : '−'}{Math.round(Math.abs(r.delta) * 100)}%</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-small text-ink-3">
        {week.areasHit} of {week.areaCount} areas this week.{' '}
        {hitAll ? `Every area earned XP: the +${BALANCE_XP} XP balance bonus is yours.` : `Earn XP in every area in a week for +${BALANCE_XP} XP.`}
      </p>
    </Card>
  )
}
