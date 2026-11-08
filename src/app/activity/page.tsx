import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChartColumn, Clapperboard, LibraryBig, Monitor, MonitorSmartphone } from 'lucide-react'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { LibraryGrid } from '@/ui/components/library'
import { SiteKind } from '@/ui/components/site-kind'
import { getUser } from '@/core/user'
import { env } from '@/core/env'
import { activitySummary } from '@/core/activity'
import { addDays, formatDay, localDate } from '@/core/time'
import { KIND_INFO, type ActivityKind } from '@/domain/activity'
import { Badge, Card, CardHeader, KpiStrip, PageHeader, Skeleton } from '@/ui/components/card'
import { BrandLogo } from '@/ui/components/brand-logo'
import { StackedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { KIND_COLOR } from '@/ui/activity-colors'

export const metadata: Metadata = { title: 'Activity' }


const hm = (seconds: number) => {
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Where your time goes"
        description="Focused time on sites, YouTube, courses and Mac apps, sorted into learning, work and play. Recorded on this Mac by the ReLife extension and app watcher; nothing leaves it."
      />
      <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[104px] rounded-lg" /><Skeleton className="h-[320px] rounded-lg" /></div>}>
        <Activity />
      </Suspense>
    </>
  )
}

async function Activity() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const from = addDays(today, -6)
  const [s, library] = await Promise.all([
    activitySummary(user, from, today),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), ne(schema.learningItems.status, 'done')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
  ])
  const connected = !!env('ACTIVITY_TOKEN')

  if (!s.rows) return <Setup connected={connected} />

  const kind = (k: ActivityKind) => s.byKind.find((x) => x.kind === k)?.seconds ?? 0
  const todayKinds = s.byDay.get(today) ?? new Map()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const shown = s.byKind.map((x) => x.kind)

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Learning, 7 days', value: hm(kind('learning')), sub: `${hm(todayKinds.get('learning') ?? 0)} today` },
        { label: 'Deep work, 7 days', value: hm(kind('work')), sub: `${hm(todayKinds.get('work') ?? 0)} today` },
        { label: 'Entertainment, 7 days', value: hm(kind('entertainment')), sub: `${hm(todayKinds.get('entertainment') ?? 0)} today` },
        { label: 'Social media, 7 days', value: hm(kind('social')), sub: `${hm(todayKinds.get('social') ?? 0)} today` },
      ]} />

      <Card>
        <CardHeader title="Each day" icon={<ChartColumn strokeWidth={2} />} color="var(--pill)" description={`${hm(s.total)} tracked in the last 7 days`} />
        <StackedBars
          categories={days.map((d) => formatDay(d, { weekday: 'short' }))}
          series={shown.map((k) => ({ id: k, name: KIND_INFO[k].label, color: KIND_COLOR[k], values: days.map((d) => Math.round((s.byDay.get(d)?.get(k) ?? 0) / 60)) }))}
          unit="min" label="Minutes per day by kind of activity"
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top sites and apps" icon={<Monitor strokeWidth={2} />} color="var(--pill)" description="Last 7 days · change what a site counts as and its past time is re-sorted" />
          <ul className="flex flex-col divide-y divide-divider">
            {s.places.map((p) => (
              <li key={p.name} className="flex items-center gap-3 py-2.5">
                <BrandLogo name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-ink">{p.name}</span>
                  <span className="block text-[12px] text-ink-3">{p.source === 'mac' ? 'Mac app' : 'Website'}</span>
                </span>
                {p.source === 'browser' ? <SiteKind domain={p.name} kind={p.kind} /> : <Badge color={KIND_COLOR[p.kind]}>{KIND_INFO[p.kind].label}</Badge>}
                <span className="w-16 text-end text-[13px] font-medium text-ink tabular-nums">{hm(p.seconds)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="YouTube" icon={<Clapperboard strokeWidth={2} />} color="var(--cat-health)" description="Lessons count as learning; the rest as entertainment" />
          {s.videos.length ? (
            <ul className="flex flex-col divide-y divide-divider">
              {s.videos.map((v) => (
                <li key={v.title} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: KIND_COLOR[v.kind] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{v.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{[v.channel, KIND_INFO[v.kind].label].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="w-14 text-end text-[13px] font-medium text-ink tabular-nums">{hm(v.seconds)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-3">No YouTube this week.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader title="Library" icon={<LibraryBig strokeWidth={2} />} color="var(--pill)" description="Courses, shows and series you track from the extension (press Track this on any page)" />
        <LibraryGrid items={library} empty={<p className="text-[13px] text-ink-3">Nothing tracked yet. Open a course or show, click the ReLife extension and press Track this.</p>} />
      </Card>
    </div>
  )
}

function Setup({ connected }: { connected: boolean }) {
  return (
    <Card>
      <EmptyState
        icon={MonitorSmartphone} color="var(--pill)"
        title={connected ? 'Waiting for the first minutes' : 'Track your laptop time'}
        description={
          <>
            1. On <Link href="/connectors" className="font-medium text-pill-ink hover:underline">Connectors → Laptop activity</Link>, set a token.{' '}
            2. In Chrome open <code className="rounded-xs bg-surface-2 px-1">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the <code className="rounded-xs bg-surface-2 px-1">extension</code> folder in ReLife.{' '}
            3. Open the extension and paste the same token. Mac apps are recorded by ReLife’s worker on its own.
          </>
        }
        action={<Link href="/connectors" className={buttonClass({ variant: 'primary', size: 'sm' })}>{connected ? 'Check the connection' : 'Set it up'}</Link>}
      />
    </Card>
  )
}
