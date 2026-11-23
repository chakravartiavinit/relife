import Link from 'next/link'
import { ChevronRight, MonitorSmartphone } from 'lucide-react'
import { areaHref, areaScope, type AreaDef, type AreaKpi } from '@/core/areas'
import type { WeekRow } from '@/domain/life-week'
import { formatNumber } from '@/domain/money'
import type { PeekRef } from '@/domain/peek'
import { hasTrend } from '@/domain/series'
import { cn } from '../../cn'
import { AREA_ICON, CapsuleIcon } from '../capsule-icon'
import { LevelBar } from '../capsule'
import { Badge, Skeleton } from '../card'
import { Sparkline, type Point } from '../charts'
import { PeekLink } from '../peek/peek-link'

export type RowChange = { text: string; peek?: PeekRef } | null

export type RowData = {
  def: AreaDef
  level?: { level: number; progress: number; xp: number }
  plan?: { done: number; total: number }
  brief?: string
  kpis: AreaKpi[]
  /** The 14-day trend of the area's main metric; drawn only when `hasTrend`. */
  spark?: { name: string; points: Point[] }
  /** This week: the days that earned XP, the XP and its change on the same days of last week. */
  week?: WeekRow
  /** The week's biggest change in words. */
  change?: RowChange
  /** The most XP any area earned this week: the bar's full width. */
  maxXp?: number
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LINK = 'rounded-xs text-pill-ink font-medium whitespace-nowrap hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill'

/** The grid every row and the column heads share: stacked on a phone, two columns from 640px, three from 960px. */
export const LEDGER_COLS = 'grid grid-cols-1 gap-x-8 grid-md:grid-cols-[minmax(0,1fr)_12.25rem] grid-lg:grid-cols-[13.75rem_minmax(0,1fr)_12.25rem]'
/** The body's own columns: three numbers, and from 960px a fourth for the trend. */
export const KPI_COLS = 'grid grid-cols-3 gap-x-5 grid-lg:grid-cols-[repeat(3,minmax(0,1fr))_7.5rem]'

/** Same height as a loaded row, so the ledger does not move when the numbers arrive. */
export const RowSkeleton = () => <div className="py-3"><Skeleton className="h-[216px] rounded-lg grid-md:h-[174px] grid-lg:h-[101px]" /></div>

/**
 * One area in the ledger: who it is (capsule, level, routines done today), how it is going (the brief with Why?, three
 * numbers that each open their Peek, a 14-day trend from 960px) and the week (dots, XP, change). The name opens the area.
 */
export function AreaRow({ d }: { d: RowData }) {
  const { def, week } = d
  const Icon = def.category ? AREA_ICON[def.category] : MonitorSmartphone
  const scope = areaScope(def)
  const trend = d.spark && hasTrend(d.spark.points) ? d.spark : null
  const trendPeek: PeekRef | null = def.pinned[0] ? { type: 'metric', id: def.pinned[0] } : null
  return (
    <li className={cn(LEDGER_COLS, 'gap-y-3 py-5')} data-area={def.slug}>
      <div className="flex items-start gap-3">
        <CapsuleIcon size="nav" color={def.color} icon={Icon} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link href={areaHref(def)} className="group inline-flex items-center gap-1 rounded-xs text-heading text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
            {def.title}
            <ChevronRight className="size-4 text-ink-3 transition-transform duration-150 ease-out-quint group-hover-fine:translate-x-0.5" strokeWidth={1.5} aria-hidden />
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-2 grid-md:flex-col grid-md:items-start">
            {d.level ? (
              <div className="flex items-center gap-2">
                <span className="num text-caption text-ink-2">Lv {d.level.level}</span>
                <LevelBar value={d.level.progress} max={1} size="sm" color={def.color} label={`${def.title} level progress`} className="w-22" />
              </div>
            ) : null}
            {d.plan?.total ? <Badge className="ms-auto tabular-nums grid-md:ms-0">{d.plan.done}/{d.plan.total} today</Badge> : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 grid-md:col-span-2 grid-md:row-start-2 grid-lg:col-span-1 grid-lg:col-start-2 grid-lg:row-start-1">
        <p className="text-body text-ink">
          {d.brief ?? def.description}
          {d.brief ? <>{' '}<PeekLink to={{ type: 'brief', id: scope }} className={LINK}>Why?</PeekLink></> : null}
        </p>
        {d.kpis.length ? (
          <dl className={cn(KPI_COLS, 'mt-3 items-end')}>
            {d.kpis.slice(0, 3).map((k) => (
              <div key={k.label} className="min-w-0">
                <PeekLink to={k.peek ?? { type: 'brief', id: scope }} className="-m-1 block rounded-md p-1 transition-colors duration-150 ease-out-quint hover-fine:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover-fine:bg-white/[0.05]">
                  <dt className="line-clamp-2 min-h-[2lh] text-caption text-ink-3 grid-md:min-h-0">{k.label}</dt>
                  <dd className={cn('num truncate text-heading', k.tone === 'good' ? 'text-good' : k.tone === 'bad' ? 'text-bad' : 'text-ink')}>{k.value}</dd>
                </PeekLink>
              </div>
            ))}
            {trend ? (
              <div className="hidden min-w-0 grid-lg:block">
                {trendPeek ? (
                  <PeekLink to={trendPeek} className="-m-1 block rounded-md p-1 transition-colors duration-150 ease-out-quint hover-fine:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover-fine:bg-white/[0.05]">
                    <span className="mb-1 block truncate text-caption text-ink-3">{trend.name}</span>
                    <Sparkline data={trend.points} color={def.color} height={32} label={`${trend.name}, last 14 days`} />
                  </PeekLink>
                ) : (
                  <>
                    <span className="mb-1 block truncate text-caption text-ink-3">{trend.name}</span>
                    <Sparkline data={trend.points} color={def.color} height={32} label={`${trend.name}, last 14 days`} />
                  </>
                )}
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-small text-ink-3">Nothing tracked yet. <Link href={areaHref(def, 'sources')} className={LINK}>Connect a source</Link></p>
        )}
      </div>

      {week ? <WeekCell def={def} week={week} change={d.change} steady={!d.change} maxXp={d.maxXp ?? 1} /> : null}
    </li>
  )
}

/** The week's dots (Monday to Sunday), how many days earned XP, the XP with its change, and a bar against the busiest area. */
/** `change` is the week's biggest change, shown even when the brief has its own sentence; `steady` says there was none. */
function WeekCell({ def, week: r, change, steady, maxXp }: { def: AreaDef; week: WeekRow; change?: RowChange; steady: boolean; maxXp: number }) {
  const pct = Math.round(Math.abs(r.delta ?? 0) * 100)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 grid-md:col-start-2 grid-md:row-start-1 grid-md:flex-col grid-md:flex-nowrap grid-md:items-stretch grid-md:justify-start grid-lg:col-start-3">
      <div className="flex items-center gap-2" role="img" aria-label={`${r.activeDays} of ${r.elapsed} days active`}>
        <span className="flex items-center gap-1.5">
          {r.marks.map((m, i) => (
            <span key={i} title={DAYS[i]} className={cn('size-2.5 rounded-full', m === 'future' ? 'border border-hairline' : m === 'idle' ? 'bg-ink/15' : '')} style={m === 'active' ? { background: def.color } : undefined} />
          ))}
        </span>
        <span className="text-caption text-ink-3 tabular-nums">{r.activeDays}/{r.elapsed} days</span>
      </div>
      <p className="flex items-baseline gap-2 tabular-nums">
        <span className="num text-heading text-ink">{formatNumber(r.xp)} XP</span>
        {r.delta == null ? <span className="text-caption text-ink-3">new</span>
          : pct === 0 ? <span className="text-caption text-ink-3">flat</span>
          : <span className={cn('text-caption', r.delta > 0 ? 'text-good' : 'text-bad')}>{r.delta > 0 ? '+' : '−'}{pct}%</span>}
      </p>
      <span aria-hidden className="hidden h-1 rounded-full bg-ink/[0.08] grid-md:block dark:bg-white/[0.08]">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (r.xp / maxXp) * 100)}%`, background: def.color }} />
      </span>
      <p className={cn('truncate min-w-0 basis-full text-caption text-ink-3 grid-md:basis-auto', !change && 'hidden grid-md:block')}>
        {change ? (change.peek ? <PeekLink to={change.peek} className="rounded-xs hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">{change.text}</PeekLink> : change.text) : steady ? 'Steady' : null}
      </p>
    </div>
  )
}
