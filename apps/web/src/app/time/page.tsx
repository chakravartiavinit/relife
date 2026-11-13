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
import { hmSeconds as hm, loadTime } from '@/core/areas/time'
import { extensionLastSeen } from '@/core/companion'
import { formatDay, localDate } from '@/core/time'
import { KIND_INFO } from '@/domain/activity'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { BrandLogo } from '@/ui/components/brand-logo'
import { StackedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { KIND_COLOR } from '@/ui/activity-colors'

export const metadata: Metadata = { title: 'Time' }

export default function TimePage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[320px] rounded-lg" /></div>}>
      <Time />
    </Suspense>
  )
}

async function Time() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const [t, library, seen] = await Promise.all([
    loadTime(user, today),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), ne(schema.learningItems.status, 'done')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
    extensionLastSeen(),
  ])
  const { s, days } = t
  const connected = !!env('ACTIVITY_TOKEN')

  if (!s.rows) return <Setup connected={connected} seen={seen} />

  const shown = s.byKind.map((x) => x.kind)

  return (
    <div className="flex flex-col gap-6">
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

/** "2 min ago", for when the extension last reached ReLife. */
function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

function Setup({ connected, seen }: { connected: boolean; seen: Date | null }) {
  return (
    <Card>
      <EmptyState
        icon={MonitorSmartphone} color="var(--pill)"
        title={connected ? 'Waiting for the first minutes' : 'Track your laptop time'}
        description={
          <>
            {connected && seen ? <span className="mb-2 block font-medium text-ink-2">The extension last reached ReLife {ago(seen)}. Time shows here after a few minutes on a site.</span> : null}
            1. On <Link href="/you/connections" className="font-medium text-pill-ink hover:underline">You › Connections → Laptop activity</Link>, set a token.{' '}
            2. In Chrome open <code className="rounded-xs bg-surface-2 px-1">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the <code className="rounded-xs bg-surface-2 px-1">apps/extension</code> folder in ReLife.{' '}
            3. Open the extension and paste the same token. Mac apps are recorded by ReLife’s worker on its own.
          </>
        }
        action={<Link href="/you/connections" className={buttonClass({ variant: 'primary', size: 'sm' })}>{connected ? 'Check the connection' : 'Set it up'}</Link>}
      />
    </Card>
  )
}
