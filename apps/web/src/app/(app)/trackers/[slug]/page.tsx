import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq } from 'drizzle-orm'
import { ChartLine, ChevronRight, History, PencilLine } from 'lucide-react'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { addDays, formatDay, localDate } from '@/core/time'
import { trackerDays } from '@/core/metrics'
import { average, fillDays } from '@/domain/series'
import { streaks } from '@/domain/streaks'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { DailyBars, TrendArea } from '@/ui/components/charts'
import { ArchiveTrackerButton, QuickLog } from '@/ui/components/forms/tracker-forms'

export const metadata: Metadata = { title: 'Tracker' }

export default function TrackerPage({ params }: PageProps<'/trackers/[slug]'>) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TrackerDetail params={params} />
    </Suspense>
  )
}

async function TrackerDetail({ params }: { params: PageProps<'/trackers/[slug]'>['params'] }) {
  await connection()
  const [{ slug: raw }, user] = await Promise.all([params, getUser()])
  const slug = decodeURIComponent(raw)
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -89)
  const [data] = await trackerDays(user, from, today, { slugs: [slug] })
  if (!data) notFound()
  const { tracker: t, days } = data

  const recent = await db.select().from(schema.entries)
    .where(and(eq(schema.entries.trackerId, t.id), eq(schema.entries.userId, user.id)))
    .orderBy(desc(schema.entries.localDate), desc(schema.entries.updatedAt)).limit(12)

  const series = fillDays(days, from, today)
  const avg = (n: number) => average(series.slice(-n).map((p) => p.value))
  const hit = (v: number) => (t.target ? (t.direction === 'down' ? v <= t.target : v >= t.target) : v > 0)
  const s = streaks([...days.entries()].filter(([, v]) => hit(v)).map(([d]) => d), today)
  const color = CATEGORY[t.category].color
  const fmt = (v: number | null) => (v == null ? '–' : `${formatNumber(v, 1)}${t.unit ? ` ${t.unit}` : ''}`)

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-[13px] text-ink-3">
        <Link href="/habits?tab=trackers" className="rounded-sm hover:text-ink">Trackers</Link>
        <ChevronRight className="size-3.5" strokeWidth={1.5} />
        <span className="text-ink-2">{t.name}</span>
      </nav>
      <PageHeader
        eyebrow={CATEGORY[t.category].label}
        title={t.name}
        description={t.target ? `Target ${fmt(t.target)} a day, ${t.direction === 'down' ? 'lower is better' : 'higher is better'}.` : undefined}
        actions={<ArchiveTrackerButton id={t.id} name={t.name} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Last 90 days" icon={<ChartLine strokeWidth={2} />} color="var(--pill)" description={t.aggregate === 'last' ? 'Daily value' : 'Daily total'} />
          {t.aggregate === 'last' || t.kind === 'scale'
            ? <TrendArea data={series} color={color} unit={t.unit ?? undefined} target={t.target} height={260} label={`${t.name}, last 90 days`} domain={t.kind === 'scale' ? [1, 5] : undefined} />
            : <DailyBars data={series} color={color} unit={t.unit ?? undefined} target={t.target} height={260} label={`${t.name}, last 90 days`} />}
        </Card>
        <div className="flex flex-col gap-6 [&>*:last-child]:flex-1">
          <Card>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Stat label="7-day avg" value={fmt(avg(7))} />
              <Stat label="28-day avg" value={fmt(avg(28))} />
              <Stat label="90-day avg" value={fmt(avg(90))} />
              <Stat label="Streak" value={`${s.current}d`} sub={`Best ${s.best}d`} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Log today" icon={<PencilLine strokeWidth={2} />} color="var(--pill)" />
            <QuickLog slug={t.slug} name={t.name} unit={t.unit} step={t.kind === 'scale' ? '1' : undefined} />
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader title="Recent entries" icon={<History strokeWidth={2} />} color="var(--pill)" />
        {recent.length ? (
          <ul className="-my-2 divide-y divide-divider">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-ink-3 tabular-nums">{formatDay(e.localDate)}</span>
                <span className="flex-1 font-medium text-ink tabular-nums">{fmt(e.value)}</span>
                {e.note ? <span className="hidden truncate text-ink-3 sm:block">{e.note}</span> : null}
                <Badge color={e.verified ? 'var(--pill-ink)' : undefined}>{e.source}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">No entries yet.</p>
        )}
      </Card>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-8 h-9 w-56" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[340px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    </div>
  )
}
