import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { LibraryGrid } from '@/ui/components/library'
import { KindTag, SiteKind } from '@/ui/components/site-kind'
import { AREAS } from '@/core/areas'
import { getUser } from '@/core/user'
import { hmSeconds as hm, loadTime } from '@/core/areas/time'
import { laptopEnabled } from '@/core/activity'
import { extensionLastSeen } from '@/core/auth/devices'
import { formatDay, localDate } from '@/core/time'
import { KIND_INFO } from '@/domain/activity'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { BrandLogo } from '@/ui/components/brand-logo'
import { StackedBars } from '@/ui/components/charts'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass } from '@/ui/components/button'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { CHART } from '@/ui/tokens'

export const metadata: Metadata = { title: 'Time' }

export default function TimePage() {
  return (
    <Suspense fallback={<TimeSkeleton />}>
      <Time />
    </Suspense>
  )
}

/** The page's shape while it loads: the lead card, then the sites and the library. */
function TimeSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-lg:grid-cols-12">
        <Skeleton className="h-[760px] rounded-lg grid-lg:col-span-12 grid-lg:h-[540px]" />
        <Skeleton className="h-[640px] rounded-lg grid-lg:col-span-7" />
        <Skeleton className="h-[520px] rounded-lg grid-lg:col-span-5" />
      </div>
    </div>
  )
}

/** The kind's colour in the chart and the list: the lead in Time's colour, the rest neutral, by rank. */
const kindColor = (rank: number, accent: string) => (rank === 0 ? accent : CHART.neutral[Math.min(rank - 1, 2)])

async function Time() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const [t, library, seen] = await Promise.all([
    loadTime(user, today),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), ne(schema.learningItems.status, 'done')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
    extensionLastSeen(user.id),
  ])
  const { s, days, tracked } = t
  const connected = await laptopEnabled(user.id)

  if (!s.rows) return <Setup connected={connected} seen={seen} />

  const accent = AREAS.time.color
  const shown = s.byKind.map((x) => x.kind)

  return (
    <PageGrid>
      {/* The lead: each day, with By kind beside it as its legend. */}
      <GridItem>
        <Card aria-labelledby="days-heading" className="grid gap-0 p-0 grid-lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="p-5">
            <CardHeader title={<span id="days-heading">Each day</span>} description={`${hm(s.total)} tracked in the last 7 days · ${hm(s.total / tracked)} a day`} />
            <StackedBars
              categories={days.map((d) => (d === today ? 'Today' : formatDay(d, { weekday: 'short' })))}
              series={s.byKind.map((k) => ({ id: k.kind, name: k.label, color: 'var(--ink-3)', values: days.map((d) => Math.round((s.byDay.get(d)?.get(k.kind) ?? 0) / 60)) }))}
              unit="min" label="Minutes per day by kind of activity" height={340} top={shown.length} accent={accent} legend={false}
            />
          </div>
          <div className="border-t border-divider p-5 grid-lg:border-s grid-lg:border-t-0">
            <CardHeader title="By kind" description="Share of the week, and the places it went to" />
            <ul className="flex flex-col gap-5">
              {s.byKind.map((k, i) => (
                <li key={k.kind}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-body font-medium text-ink">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: kindColor(i, accent) }} />
                      <span className="truncate">{k.label}</span>
                      <span className="text-caption font-normal text-ink-3 tabular-nums">{Math.round((k.seconds / s.total) * 100)}%</span>
                    </span>
                    <span className="text-body font-medium text-ink tabular-nums">{hm(k.seconds)}</span>
                  </div>
                  <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-ink/[0.08]">
                    <span className="reveal-fill block h-full w-full rounded-full bg-ink-2" style={{ '--fill': `${(k.seconds / s.byKind[0].seconds) * 100}%`, '--i': i } as React.CSSProperties} />
                  </span>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {(s.placesByKind.get(k.kind) ?? []).slice(0, 2).map((p) => (
                      <li key={p.name} className="rounded-sm bg-surface-2 px-2 py-0.5 text-caption text-ink-2 tabular-nums"><span className="max-w-[10rem] truncate align-bottom">{p.name}</span> <span className="text-ink-3">{hm(p.seconds)}</span></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </GridItem>

      {/* Top sites, with what the time was actually on as its footer. */}
      <GridItem span={{ base: 12, lg: 7 }}>
        <Card aria-labelledby="sites-heading" className="flex h-full flex-col p-0">
          <div className="p-5 pb-2">
            <CardHeader className="mb-2" title={<span id="sites-heading">Top sites and apps</span>} description="Last 7 days · change what a site counts as and its past time is re-sorted" />
          </div>
          <ul className="flex flex-col divide-y divide-divider border-t border-divider px-5">
            {s.places.slice(0, 7).map((p) => (
              // On a phone the kind picker drops under the name, so the name keeps the row's width.
              <li key={p.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 grid-md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <span className="row-span-2 self-start grid-md:row-span-1"><BrandLogo name={p.name} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink">{p.name}</span>
                  <span className="block text-caption text-ink-3">{p.source === 'mac' ? 'Mac app' : 'Website'}</span>
                </span>
                <span className="col-start-2 row-start-2 justify-self-start grid-md:col-start-auto grid-md:row-start-auto grid-md:justify-self-auto">
                  {p.source === 'browser' ? <SiteKind domain={p.name} kind={p.kind} /> : <KindTag kind={p.kind} />}
                </span>
                <span className="col-start-3 row-start-1 w-16 text-end text-small font-medium text-ink tabular-nums grid-md:col-start-auto grid-md:row-start-auto">{hm(p.seconds)}</span>
              </li>
            ))}
          </ul>
          {/* What the time was actually on, across every site and app (a video, a doc, a chat, a course page). */}
          <div className="border-t border-divider p-5">
            <h3 className="text-heading text-ink">What you spent it on</h3>
            <p className="mt-0.5 mb-3 text-small text-ink-3">Last 7 days · top pages and windows, from every site and app</p>
            {s.pages.length ? (
              <ul className="flex flex-col divide-y divide-divider">
                {s.pages.map((v) => (
                  <li key={`${v.place}|${v.title}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <BrandLogo name={v.place} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small text-ink">{v.title}</span>
                      <span className="block truncate text-caption text-ink-3">{[v.place, v.channel, KIND_INFO[v.kind].label].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="w-14 text-end text-small font-medium text-ink tabular-nums">{hm(v.seconds)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-small text-ink-3">Page titles show up here as you browse.</p>}
          </div>
        </Card>
      </GridItem>

      <GridItem span={{ base: 12, lg: 5 }}>
        <Card aria-labelledby="library-heading" className="h-full">
          <CardHeader title={<span id="library-heading">Library</span>} description="Courses, shows and series you track from the extension (press Track this on any page)" />
          <LibraryGrid compact items={library} empty={<p className="text-small text-ink-3">Nothing tracked yet. Open a course or show, click the {brand.name} extension and press Track this.</p>} />
        </Card>
      </GridItem>
    </PageGrid>
  )
}

/** "2 min ago", for when the extension last reached the app. */
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
            {connected && seen ? <span className="mb-2 block font-medium text-ink-2">The extension last reached {brand.name} {ago(seen)}. Time shows here after a few minutes on a site.</span> : null}
            1. On <Link href="/you/connections" className="font-medium text-pill-ink hover:underline">You › Connections → Laptop activity</Link>, set a token.{' '}
            2. In Chrome open <code className="rounded-xs bg-surface-2 px-1">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the <code className="rounded-xs bg-surface-2 px-1">apps/extension</code> folder in {brand.name}.{' '}
            3. Open the extension and paste the same token. Mac apps are recorded by {brand.name}’s worker on its own.
          </>
        }
        action={<Link href="/you/connections" className={buttonClass({ variant: 'primary', size: 'sm' })}>{connected ? 'Check the connection' : 'Set it up'}</Link>}
      />
    </Card>
  )
}
