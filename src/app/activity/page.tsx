import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChartColumn, FileText, Layers, LibraryBig, Monitor, MonitorSmartphone } from 'lucide-react'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { LibraryGrid } from '@/ui/components/library'
import { KindTag, SiteKind } from '@/ui/components/site-kind'
import { getUser } from '@/core/user'
import { env } from '@/core/env'
import { activitySummary } from '@/core/activity'
import { addDays, formatDay, localDate } from '@/core/time'
import { KIND_INFO, type ActivityKind } from '@/domain/activity'
import { Card, CardHeader, KpiStrip, PageHeader, Skeleton } from '@/ui/components/card'
import { BrandLogo } from '@/ui/components/brand-logo'
import { StackedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { KIND_COLOR } from '@/ui/activity-colors'

export const metadata: Metadata = { title: 'Activity' }


/** Focus and distraction, as the Today page and the System count them. */
const FOCUS: ActivityKind[] = ['learning', 'work']
const DISTRACT: ActivityKind[] = ['social', 'entertainment']
const DISTRACT_CAP = 90 * 60 // social 30 min + entertainment 60 min

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
        description="Everything you do on this Mac, every site and app, sorted into learning, work, play and the rest. Recorded by the ReLife extension and app watcher; nothing leaves it."
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

  const todayKinds = s.byDay.get(today) ?? new Map<ActivityKind, number>()
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const shown = s.byKind.map((x) => x.kind)
  const sum = (m: Map<ActivityKind, number>, ks: ActivityKind[]) => ks.reduce((a, k) => a + (m.get(k) ?? 0), 0)
  const todayTotal = [...todayKinds.values()].reduce((a, b) => a + b, 0)
  const focusToday = sum(todayKinds, FOCUS), distractToday = sum(todayKinds, DISTRACT)
  // Averages over the days that have any tracking, so a new install doesn't divide by 7.
  const tracked = days.filter((d) => s.byDay.has(d)).length || 1
  const focusAvg = days.reduce((a, d) => a + sum(s.byDay.get(d) ?? new Map(), FOCUS), 0) / tracked

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip items={[
        { label: 'Today', value: hm(todayTotal), sub: `${hm(s.total / tracked)} a day this week` },
        { label: 'Focus today', value: hm(focusToday), sub: `Learning and deep work · ${hm(focusAvg)} a day on average`, tone: focusToday > 0 && focusToday >= focusAvg ? 'good' : undefined },
        { label: 'Distraction today', value: hm(distractToday), sub: `Social and entertainment · cap ${hm(DISTRACT_CAP)}`, tone: distractToday > DISTRACT_CAP ? 'bad' : undefined },
        { label: 'Most time on', value: s.places[0]?.name ?? '–', sub: s.places[0] ? `${hm(s.places[0].seconds)} this week` : undefined },
      ]} />

      <Card>
        <CardHeader title="Each day" icon={<ChartColumn strokeWidth={2} />} color="var(--pill)" description={`${hm(s.total)} tracked in the last 7 days`} />
        <StackedBars
          categories={days.map((d) => formatDay(d, { weekday: 'short' }))}
          series={shown.map((k) => ({ id: k, name: KIND_INFO[k].label, color: KIND_COLOR[k], values: days.map((d) => Math.round((s.byDay.get(d)?.get(k) ?? 0) / 60)) }))}
          unit="min" label="Minutes per day by kind of activity"
        />
      </Card>

      {/* Each kind of time and where it went: one row per kind, its share of the week, its top places. */}
      <Card>
        <CardHeader title="By kind" icon={<Layers strokeWidth={2} />} color="var(--pill)" description="Last 7 days · what each kind of time was spent on" />
        <ul className="flex flex-col divide-y divide-divider">
          {s.byKind.map((k, i) => (
            <li key={k.kind} className="grid grid-cols-1 gap-x-6 gap-y-2 py-3 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-[14px] font-medium text-ink">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k.kind] }} />{k.label}
                  </span>
                  <span className="text-[13.5px] font-semibold text-ink tabular-nums">{hm(k.seconds)}</span>
                </div>
                <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="reveal-fill block h-full w-full rounded-full" style={{ '--fill': `${(k.seconds / s.total) * 100}%`, background: KIND_COLOR[k.kind], '--i': i } as React.CSSProperties} />
                </span>
                <span className="mt-1 block text-[11.5px] text-ink-3 tabular-nums">{Math.round((k.seconds / s.total) * 100)}% of the week</span>
              </div>
              <ul className="flex flex-wrap content-start gap-2">
                {(s.placesByKind.get(k.kind) ?? []).map((p) => (
                  <li key={p.name} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-[12.5px]">
                    <BrandLogo name={p.name} size="sm" className="size-6 rounded-full" />
                    <span className="max-w-[12rem] truncate text-ink">{p.name}</span>
                    <span className="text-ink-3 tabular-nums">{hm(p.seconds)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top sites and apps" icon={<Monitor strokeWidth={2} />} color="var(--pill)" description="Last 7 days · change what a site counts as and its past time is re-sorted" />
          <ul className="flex flex-col divide-y divide-divider">
            {s.places.map((p) => (
              // On a phone the kind picker drops under the name, so the name keeps the row's width.
              <li key={p.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <span className="max-sm:row-span-2 max-sm:self-start"><BrandLogo name={p.name} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">{p.name}</span>
                  <span className="block text-[12px] text-ink-3">{p.source === 'mac' ? 'Mac app' : 'Website'}</span>
                </span>
                <span className="max-sm:col-start-2 max-sm:row-start-2 max-sm:justify-self-start">
                  {p.source === 'browser' ? <SiteKind domain={p.name} kind={p.kind} /> : <KindTag kind={p.kind} />}
                </span>
                <span className="w-16 text-end text-[13px] font-medium text-ink tabular-nums max-sm:col-start-3 max-sm:row-start-1">{hm(p.seconds)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* What the time was actually on, across every site and app (a video, a doc, a chat, a course page). */}
        <Card>
          <CardHeader title="What you spent it on" icon={<FileText strokeWidth={2} />} color="var(--pill)" description="Last 7 days · top pages and windows, from every site and app" />
          {s.pages.length ? (
            <ul className="flex flex-col divide-y divide-divider">
              {s.pages.map((v) => (
                <li key={`${v.place}|${v.title}`} className="flex items-center gap-3 py-2.5">
                  <BrandLogo name={v.place} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{v.title}</span>
                    <span className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[v.kind] }} />
                      {[v.place, v.channel, KIND_INFO[v.kind].label].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="w-14 text-end text-[13px] font-medium text-ink tabular-nums">{hm(v.seconds)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-ink-3">Page titles show up here as you browse.</p>}
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
