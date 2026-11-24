import Link from 'next/link'
import { formatDay } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { trendWord } from '@/domain/progress-words'
import { TIER_COLOR } from '../achievement-icons'
import { cn } from '../cn'
import { TIER_ORDER, type BoardItem } from './achievement-parts'
import { buttonLinkClass } from './button'
import { Card } from './card'
import { FoldLink } from './fold-link'
import { Picture } from './picture'
import { StatusWord } from './status-word'
import type { ConsistencyData } from './consistency'

type Cells = ConsistencyData['grid'][number]['cells']

// The three small cards under the character sheet: achievements, consistency and XP, each one small visual, one line
// and one link that opens the full view (a fold lower on the page).

/** Every area together, one cell per day: what was due and what was done. */
export const overallDays = ({ days, grid }: ConsistencyData): Cells =>
  days.map((d, i) => ({ d, due: grid.reduce((n, r) => n + r.cells[i].due, 0), done: grid.reduce((n, r) => n + r.cells[i].done, 0) }))

function Glance({ label, aside, visual, note, link }: { label: React.ReactNode; aside?: React.ReactNode; visual: React.ReactNode; note: React.ReactNode; link: React.ReactNode }) {
  return (
    <Card as="div" className="flex h-full min-w-0 flex-col gap-3">
      <div className="flex min-h-5 items-center justify-between gap-2 text-label text-ink-2">
        <span className="truncate">{label}</span>
        {aside}
      </div>
      {visual}
      <p className="mt-auto flex items-baseline justify-between gap-3 text-small text-ink-3">
        <span className="min-w-0">{note}</span>
        <span className="shrink-0 text-ink-2">{link}</span>
      </p>
    </Card>
  )
}

const dayName = (d: string, today: string, yesterday: string) => (d === today ? 'today' : d === yesterday ? 'yesterday' : formatDay(d, { day: 'numeric', month: 'short' }))

/** Every achievement as a tick in its medal colour (bronze, silver, gold; locked ones faint), and the latest one. */
export function AchievementsGlance({ items, today, yesterday }: { items: BoardItem[]; today: string; yesterday: string }) {
  const done = items.filter((a) => a.unlockedAt).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier])
  const latest = [...done].sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!))[0]
  const count = (t: BoardItem['tier']) => done.filter((a) => a.tier === t).length
  return (
    <Glance
      label="Achievements"
      aside={<span className="font-normal text-ink-3 tabular-nums">{done.length} of {items.length}</span>}
      visual={
        <div role="img" aria-label={`${done.length} of ${items.length} unlocked: ${count('bronze')} bronze, ${count('silver')} silver, ${count('gold')} gold`} className="flex h-6 gap-0.5">
          {done.map((a) => <span key={a.key} className="flex-1 rounded-xs" style={{ background: TIER_COLOR[a.tier] }} />)}
          {Array.from({ length: items.length - done.length }, (_, i) => <span key={i} className="flex-1 rounded-xs bg-ink/[0.08]" />)}
        </div>
      }
      note={latest ? (
        <span className="flex items-center gap-2">
          <Picture of="achievement" id={latest.key} tier={latest.tier} size={20} />
          <span className="truncate">Latest: {latest.name}, {latest.tier}, {dayName(latest.unlockedOn!, today, yesterday)}</span>
        </span>
      ) : 'Check things off and the first badges come quickly.'}
      link={<FoldLink target="achievements-fold">All {items.length}</FoldLink>}
    />
  )
}

/** The last 14 days as one strip: the share of what was due that got done, every area together. */
export function ConsistencyGlance({ data }: { data: ConsistencyData }) {
  const cells = overallDays(data)
  const sum = (xs: typeof cells, k: 'due' | 'done') => xs.reduce((n, x) => n + x[k], 0)
  const share = (xs: typeof cells) => (sum(xs, 'due') ? sum(xs, 'done') / sum(xs, 'due') : 0)
  const status = trendWord(share(cells.slice(7)), share(cells.slice(0, 7)))
  const most = cells.filter((x) => x.due && x.done / x.due >= 0.5).length
  const has = sum(cells, 'due') > 0
  return (
    <Glance
      label="Consistency, 14 days"
      aside={<StatusWord status={has ? status : 'Quiet'} />}
      visual={
        <ol aria-label="Routines done each day, last 14 days" className="flex h-6 gap-0.5">
          {cells.map((x) => {
            const s = x.due ? x.done / x.due : 0
            const label = `${formatDay(x.d)}: ${x.due ? `${x.done} of ${x.due} done` : 'nothing scheduled'}`
            return (
              <li
                key={x.d} role="img" aria-label={label} title={label}
                className={cn('flex-1 rounded-xs', !x.due && 'shadow-[inset_0_0_0_1px_var(--hairline)]', !!x.due && !s && 'bg-surface-3')}
                style={s ? { background: `color-mix(in oklch, var(--good) ${Math.round(22 + s * 68)}%, transparent)` } : undefined}
              />
            )
          })}
        </ol>
      }
      note={has ? `Most routines done on ${most} of 14 days` : 'Add a routine in Plan and its days fill in here.'}
      link={has ? <FoldLink target="consistency-fold">By area</FoldLink> : <Link href="/plan/routines" className={buttonLinkClass(undefined, { target: true })}>Routines</Link>}
    />
  )
}

/** XP per day for the last 30 days as bars: today is the blue one. */
export function XpGlance({ days }: { days: { d: string; n: number }[] }) {
  const total = days.reduce((a, x) => a + x.n, 0)
  const max = Math.max(1, ...days.map((x) => x.n))
  const half = days.length / 2
  const status = trendWord(days.slice(half).reduce((a, x) => a + x.n, 0), days.slice(0, half).reduce((a, x) => a + x.n, 0))
  return (
    <Glance
      label="XP, last 30 days"
      aside={<StatusWord status={status} />}
      visual={
        <div role="img" aria-label={`XP per day, last 30 days: ${formatNumber(total)} in all`} className="flex h-6 items-end gap-0.5">
          {days.map((x, i) => (
            <span
              key={x.d} title={`${formatDay(x.d)}: ${formatNumber(x.n)} XP`}
              className={cn('flex-1 rounded-xs', i === days.length - 1 ? 'bg-pill' : 'bg-ink/[0.18]')}
              style={{ height: `${Math.max(8, (x.n / max) * 100)}%` }}
            />
          ))}
        </div>
      }
      note={total ? `About ${formatNumber(Math.round(total / days.length))} XP a day, ${formatNumber(total)} in all` : 'No XP in the last 30 days yet.'}
      link={<FoldLink target="xp-fold">See the days</FoldLink>}
    />
  )
}
