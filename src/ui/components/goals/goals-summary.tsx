import Link from 'next/link'
import { connection } from 'next/server'
import { CalendarCheck, ChevronRight, Target } from 'lucide-react'
import { goalsSummary } from '@/core/goals'
import { getUser } from '@/core/user'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader } from '../card'
import { Capsule } from '../capsule'
import { STATUS_LABEL, fill, target, value } from './format'

// Today: active outcome goals in one card, hidden when there are none (the Goals page handles discovery).

export async function TodayGoals() {
  await connection()
  const user = await getUser()
  const goals = await goalsSummary(user)
  if (!goals.length) return null
  const due = goals.filter((g) => g.reviewDue).length
  return (
    <Card>
      <CardHeader icon={<Target strokeWidth={1.5} />} color="var(--pill)" title="Outcome goals" description={`${goals.length} active`}
        action={<Link href="/goals" className="inline-flex h-10 items-center rounded-md px-2 text-[13px] font-medium text-ink-2 hover:text-ink">All goals</Link>} />
      {due ? (
        <Link href="/goals/review" className="mb-4 flex items-center gap-3 rounded-md bg-pill/7 px-3 py-2.5 transition-[background-color] duration-150 hover:bg-pill/12">
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-pill-ink" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-ink">Weekly review is due</span>
            <span className="block text-[12.5px] text-ink-3 tabular-nums">{due} {due === 1 ? 'goal' : 'goals'} to review</span>
          </span>
          <ChevronRight aria-hidden className="size-4 text-ink-3" strokeWidth={1.5} />
        </Link>
      ) : null}
      <ul className="divide-y divide-divider">
        {goals.map((g) => {
          const o = g.snapshot.outcome
          const right = g.measureKind === 'check_in' && o.observations === 0 ? 'Check-in due' : o.status === 'not_enough_data' ? STATUS_LABEL.not_enough_data : g.measureKind === 'tracker' ? `${o.observations} of ${g.snapshot.window.days} days` : STATUS_LABEL[o.status]
          return (
            <li key={g.id} className="py-3 first:pt-0 last:pb-0">
              <Link href={`/goals/${g.id}`} className="flex min-h-10 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] font-medium text-ink hover:underline">{g.title}</span>
                <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{right}</span>
              </Link>
              <Capsule size="sm" className="mt-2" value={fill(g.snapshot)} color={CATEGORY[g.area].color} label={`Progress toward ${g.title}`} />
              <p className="mt-1.5 text-[12.5px] text-ink-3 tabular-nums">{o.current != null ? value(o.current, g.unit) : '—'} · target {target(g)}</p>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
