import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Sparkles } from 'lucide-react'
import { CATEGORIES, type Category } from '@/db/schema'
import { AREA_LIST, areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { loadTime } from '@/core/areas/time'
import { loadDayPlan } from '@/core/day-plan'
import { loadAreaLevels, loadHubBriefs, loadHubSparks, loadLifeWeek } from '@/core/life-week'
import { formatDay, localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { Card, Skeleton, SystemLabel } from '@/ui/components/card'
import { AreaTile, TileSkeleton } from '@/ui/components/life/area-tile'
import { TimeTile } from '@/ui/components/life/time-tile'
import { WeekTable } from '@/ui/components/life/week-table'
import { PeekLink } from '@/ui/components/peek/peek-link'

export const metadata: Metadata = { title: 'Life' }

/** The Life hub: today's brief, one tile per area (and Time) with its own brief and numbers, then the week by area. */
export default function LifePage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<HubHeader />}><Header /></Suspense>
      <Suspense fallback={<Tiles />}><LiveTiles /></Suspense>
      <Suspense fallback={<Skeleton className="h-[400px] rounded-lg" />}><Week /></Suspense>
    </div>
  )
}

/** The date and the day's brief. The brief streams in; until then the card holds the same height. */
function HubHeader({ date, brief }: { date?: string; brief?: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <SystemLabel>Life{date ? ` · ${date}` : ''}</SystemLabel>
      <h1 className="mt-0.5 font-display text-title text-ink sm:text-display">{date ?? 'Your life'}</h1>
      <p className="mt-1.5 flex min-h-[2lh] max-w-[64ch] items-start gap-2 text-body text-ink-2">
        {brief ? (
          <>
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
            <span>{brief}{' '}<PeekLink to={{ type: 'brief', id: 'today' }} className="rounded-xs font-semibold whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink></span>
          </>
        ) : 'All six areas and your laptop time, one click each.'}
      </p>
    </Card>
  )
}

async function Header() {
  await connection()
  const user = await getUser()
  const briefs = await loadHubBriefs(user)
  return <HubHeader date={formatDay(localDate(new Date(), user.timezone), { weekday: 'long', day: 'numeric', month: 'long' })} brief={briefs.get('today')?.text} />
}

/** Areas the user shows (all when they have not picked), always in the same order. */
const shown = (areas: Category[] | undefined) => AREA_LIST.filter((d) => d.category && (!areas?.length || areas.includes(d.category)))

/** The grid before its data arrives: the right number of tiles at their final size. */
function Tiles({ children }: { children?: React.ReactNode }) {
  return (
    <section aria-label="Areas" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {children ?? <>{Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)}<TileSkeleton wide /></>}
    </section>
  )
}

async function LiveTiles() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const defs = shown(user.profile.areas)
  const [briefs, levels, plan, sparks] = await Promise.all([
    loadHubBriefs(user), loadAreaLevels(user), loadDayPlan(user),
    loadHubSparks(user, today, Object.fromEntries(defs.map((d) => [d.slug, d.pinned[0]]))),
  ])
  return (
    <Tiles>
      {defs.map((def) => (
        <Suspense key={def.slug} fallback={<TileSkeleton />}>
          <Tile def={def} brief={briefs.get(areaScope(def))?.text} level={levels.find((l) => l.area === def.category)} plan={def.category ? plan.byCat[def.category] : undefined} spark={sparks[def.slug]} />
        </Suspense>
      ))}
      <Suspense fallback={<TileSkeleton wide />}><Time brief={briefs.get('time')?.text} /></Suspense>
    </Tiles>
  )
}

async function Tile({ def, brief, level, plan, spark }: { def: AreaDef; brief?: string; level?: { level: number; progress: number; xp: number }; plan?: { done: number; total: number }; spark?: { name: string; points: { date: string; value: number | null }[] } }) {
  await connection()
  const kpis = await loadAreaKpis(await getUser(), def.slug)
  return <AreaTile d={{ def, brief, level, plan, kpis, spark }} />
}

async function Time({ brief }: { brief?: string }) {
  await connection()
  const user = await getUser()
  const t = await loadTime(user, localDate(new Date(), user.timezone))
  const kpis = await loadAreaKpis(user, 'time')
  return <TimeTile kinds={t.s.byKind} kpis={kpis} brief={brief} />
}

async function Week() {
  await connection()
  const user = await getUser()
  const w = await loadLifeWeek(user, [...CATEGORIES])
  const show = shown(user.profile.areas).map((d) => d.category as string)
  return <WeekTable week={w} changes={w.changes} show={show} />
}

