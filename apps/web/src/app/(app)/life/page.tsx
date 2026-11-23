import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { CATEGORIES, type Category } from '@/db/schema'
import { AREA_LIST, areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { loadTime } from '@/core/areas/time'
import { loadDayPlan } from '@/core/day-plan'
import { loadAreaLevels, loadHubBriefs, loadHubSparks, loadLifeWeek } from '@/core/life-week'
import { formatDay, localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { PageHeader } from '@/ui/components/card'
import { AreaLedger, LedgerSkeleton, SummarySkeleton, WeekBalance } from '@/ui/components/life/area-ledger'
import { AreaRow, RowSkeleton, type RowData } from '@/ui/components/life/area-row'
import { TimeSkeleton, TimeTile } from '@/ui/components/life/time-tile'
import { PeekLink } from '@/ui/components/peek/peek-link'

export const metadata: Metadata = { title: 'Life' }

/** The Life hub: today's brief and the week's balance, one ledger row per area, then Time as its own block. */
export default function LifePage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<HubHeader summary={<SummarySkeleton />} />}><Header /></Suspense>
      <PageGrid>
        <GridItem><Suspense fallback={<LedgerSkeleton />}><Ledger /></Suspense></GridItem>
        <GridItem><Suspense fallback={<TimeSkeleton />}><Time /></Suspense></GridItem>
      </PageGrid>
    </div>
  )
}

/** Every category once, so the cached week is shared by the head and the ledger. */
const ALL_AREAS = [...CATEGORIES]

/** The date, the day's brief and the week's balance. The brief streams in; until then the head holds its height. */
function HubHeader({ date, brief, summary }: { date?: string; brief?: string; summary?: React.ReactNode }) {
  return (
    <PageHeader
      className="mb-0"
      eyebrow={`Life${date ? ` · ${date}` : ''}`}
      title={date ?? 'Your life'}
      summary={summary}
      description={brief ? (
        <>
          {brief}{' '}<PeekLink to={{ type: 'brief', id: 'today' }} className="rounded-xs font-medium whitespace-nowrap text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink>
        </>
      ) : 'All six areas and your laptop time, one click each.'}
    />
  )
}

async function Header() {
  await connection()
  const user = await getUser()
  const briefs = await loadHubBriefs(user)
  return (
    <HubHeader
      date={formatDay(localDate(new Date(), user.timezone), { weekday: 'long', day: 'numeric', month: 'long' })}
      brief={briefs.get('today')?.text}
      summary={<Suspense fallback={<SummarySkeleton />}><Balance /></Suspense>}
    />
  )
}

/** Areas the user shows (all when they have not picked), always in the same order. */
const shown = (areas: Category[] | undefined) => AREA_LIST.filter((d) => d.category && (!areas?.length || areas.includes(d.category)))

async function Balance() {
  await connection()
  const user = await getUser()
  const week = await loadLifeWeek(user, ALL_AREAS)
  return <WeekBalance week={week} areas={shown(user.profile.areas)} />
}

async function Ledger() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const defs = shown(user.profile.areas)
  const [briefs, levels, plan, sparks, week] = await Promise.all([
    loadHubBriefs(user), loadAreaLevels(user), loadDayPlan(user),
    loadHubSparks(user, today, Object.fromEntries(defs.map((d) => [d.slug, d.pinned[0]]))),
    loadLifeWeek(user, ALL_AREAS),
  ])
  const mine = new Set(defs.map((d) => d.category as string))
  const maxXp = Math.max(1, ...week.rows.filter((r) => mine.has(r.area)).map((r) => r.xp))
  return (
    <AreaLedger>
      {defs.map((def) => (
        <Suspense key={def.slug} fallback={<RowSkeleton />}>
          <Row
            def={def} brief={briefs.get(areaScope(def))?.text} level={levels.find((l) => l.area === def.category)}
            plan={def.category ? plan.byCat[def.category] : undefined} spark={sparks[def.slug]}
            week={week.rows.find((r) => r.area === def.category)} change={def.category ? week.changes[def.category] : undefined} maxXp={maxXp}
          />
        </Suspense>
      ))}
    </AreaLedger>
  )
}

async function Row({ def, ...rest }: Omit<RowData, 'kpis'> & { def: AreaDef }) {
  await connection()
  const kpis = await loadAreaKpis(await getUser(), def.slug)
  return <AreaRow d={{ def, kpis, ...rest }} />
}

async function Time() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const [briefs, t, kpis] = await Promise.all([loadHubBriefs(user), loadTime(user, today), loadAreaKpis(user, 'time')])
  return <TimeTile kinds={t.s.byKind} kpis={kpis} brief={briefs.get('time')?.text} />
}
