import Link from 'next/link'
import { ChevronRight, MonitorSmartphone } from 'lucide-react'
import { areaHref, areaScope, type AreaDef, type AreaKpi } from '@/core/areas'
import { formatNumber } from '@/domain/money'
import { AREA_ICON, CapsuleIcon } from '../capsule-icon'
import { Capsule } from '../capsule'
import { Card, Skeleton } from '../card'
import { Sparkline, type Point } from '../charts'
import { PeekLink } from '../peek/peek-link'

export type TileData = {
  def: AreaDef
  level?: { level: number; progress: number; xp: number }
  plan?: { done: number; total: number }
  brief?: string
  kpis: AreaKpi[]
  spark?: { name: string; points: Point[] }
}

/** Same height as a loaded tile, so the grid does not move when the tiles arrive. */
export const TileSkeleton = ({ wide }: { wide?: boolean }) => <Skeleton className={wide ? 'h-[168px] rounded-lg md:col-span-2 lg:col-span-3' : 'h-[272px] rounded-lg'} />

/**
 * One area on the Life hub: where it stands today (routines done), the brief, three numbers that each open
 * their Peek, and a 14-day trend of its main metric. The name opens the area.
 */
export function AreaTile({ d }: { d: TileData }) {
  const { def } = d
  const Icon = def.category ? AREA_ICON[def.category] : MonitorSmartphone
  const scope = areaScope(def)
  return (
    <Card as="article" className="flex flex-col gap-4 p-5">
      <header className="flex items-start gap-3">
        <CapsuleIcon size="sm" color={def.color} icon={Icon} />
        <div className="min-w-0 flex-1">
          <Link href={areaHref(def)} className="group inline-flex items-center gap-1 rounded-xs text-heading text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
            {def.title}
            <ChevronRight className="size-4 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
          </Link>
          {d.level ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="num text-small text-ink-2">Lv {d.level.level}</span>
              <Capsule value={d.level.progress} max={1} size="sm" color={def.color} label={`${def.title} level progress`} className="w-20" />
            </div>
          ) : null}
        </div>
        {d.plan?.total ? (
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-caption text-ink-2 tabular-nums dark:bg-white/[0.06]">{d.plan.done}/{d.plan.total} today</span>
        ) : null}
      </header>
      {/* Two lines, whatever the brief says: the tile keeps its height. */}
      <p className="line-clamp-2 min-h-[2lh] text-body text-ink-2">
        {d.brief ?? def.description}
        {d.brief ? <>{' '}<PeekLink to={{ type: 'brief', id: scope }} className="rounded-xs font-semibold whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></> : null}
      </p>
      {d.kpis.length ? (
        <dl className="grid grid-cols-3 gap-3">
          {d.kpis.slice(0, 3).map((k) => (
            <div key={k.label} className="min-w-0">
              <PeekLink to={k.peek ?? { type: 'brief', id: scope }} className="block rounded-md p-1 -m-1 transition-colors duration-150 ease-out-quint hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]">
                <dt className="line-clamp-2 min-h-[2lh] text-caption text-ink-3">{k.label}</dt>
                <dd className={`num truncate text-heading ${k.tone === 'good' ? 'text-good' : k.tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{k.value}</dd>
              </PeekLink>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-small text-ink-3">Nothing tracked yet. <Link href={areaHref(def, 'sources')} className="font-semibold text-pill-ink hover:underline">Connect a source</Link></p>
      )}
      {d.spark ? (
        <div className="mt-auto hidden sm:block">
          <div className="mb-1 flex items-baseline justify-between text-caption text-ink-3"><span className="truncate">{d.spark.name}</span><span>14 days</span></div>
          <Sparkline data={d.spark.points} color={def.color} height={36} label={`${d.spark.name}, last 14 days`} />
        </div>
      ) : null}
    </Card>
  )
}

export const fmtXp = (n: number) => `${n >= 0 ? '+' : '−'}${formatNumber(Math.abs(n))} XP`
