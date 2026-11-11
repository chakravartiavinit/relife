import Link from 'next/link'
import { Activity } from 'lucide-react'
import { CATEGORIES } from '@/db/schema'
import type { User } from '@/core/user'
import { trackerDays } from '@/core/metrics'
import { addDays, formatDay, localDate } from '@/core/time'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Badge, Card } from '../card'
import { Capsule } from '../capsule'
import { Sparkline } from '../charts'
import { EmptyState } from '../empty'
import { QuickLog } from '../forms/tracker-forms'

/** Every tracker by area: today's value, 28-day spark, quick log. Server component. */
export async function TrackersGrid({ user }: { user: User }) {
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -27)
  const all = await trackerDays(user, from, today)
  if (!all.length) {
    return (
      <Card>
        <EmptyState title="No trackers yet" icon={Activity} color={'var(--pill)'} description="Create one, or type “water 250” in ⌘K and it appears here." />
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-10">
      {CATEGORIES.map((c) => {
        const list = all.filter((t) => t.tracker.category === c)
        if (!list.length) return null
        return (
          <section key={c} aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`} className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ink-3">
              <span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />
              {CATEGORY[c].label}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(({ tracker: t, days, verified }) => {
                const series = fillDays(days, from, today)
                const lastDay = [...days.keys()].sort().at(-1)
                const latest = lastDay ? days.get(lastDay)! : undefined
                const todayValue = days.get(today)
                const shown = todayValue ?? latest
                return (
                  <Card key={t.id} as="article" className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/routines/trackers/${encodeURIComponent(t.slug)}`} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                          {t.name}
                        </Link>
                        <div className="mt-0.5 text-[12px] text-ink-3">
                          {todayValue !== undefined ? 'Today' : lastDay ? `Last on ${formatDay(lastDay)}` : 'No entries in 28 days'}
                        </div>
                      </div>
                      {verified ? <Badge color="var(--pill-ink)">Synced</Badge> : null}
                    </div>
                    <div className="flex items-end justify-between gap-4">
                      <div className="font-display text-[28px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">
                        {shown === undefined ? <span className="text-ink-3">–</span> : formatNumber(shown, 1)}
                        {t.unit && shown !== undefined ? <span className="ml-1 font-sans text-[13px] font-normal text-ink-3">{t.unit}</span> : null}
                      </div>
                      <div className="w-28"><Sparkline data={series} color={CATEGORY[c].color} label={`${t.name}, last 14 days`} /></div>
                    </div>
                    {t.target ? (
                      <div className="flex items-center gap-2">
                        <Capsule size="sm" value={todayValue ?? 0} max={t.target} color={CATEGORY[c].color} label={`${t.name} today vs target`} />
                        <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">of {formatNumber(t.target, 1)}</span>
                      </div>
                    ) : null}
                    <QuickLog slug={t.slug} name={t.name} unit={t.unit} step={t.kind === 'scale' ? '1' : undefined} />
                  </Card>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
