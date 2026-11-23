import { useId } from 'react'
import Link from 'next/link'
import { AREAS, areaScope } from '@/core/areas'
import { DISTRACT, DISTRACT_CAP, FOCUS, hmSeconds as hm, type loadTime } from '@/core/areas/time'
import { formatDay } from '@/core/time'
import { KIND_INFO, type ActivityKind } from '@/domain/activity'
import type { Change, Link as PatternLink } from '@/domain/patterns'
import { STEADY_BAND } from '@/domain/status-of'
import { againstCap, againstUsual } from '@/domain/time-status'
import { Card } from '@/ui/components/card'
import { StackedBars } from '@/ui/components/charts'
import { Connection } from '@/ui/components/connection'
import { buttonLinkClass } from '@/ui/components/button'
import { Fold } from '@/ui/components/fold'
import { spanClass, PageGrid } from '@/ui/components/page-grid'
import { Picture } from '@/ui/components/picture'
import { StatCard } from '@/ui/components/stat-card'
import { CHART } from '@/ui/tokens'
import { KindRow, SiteRow } from './time-parts'

export type TimeData = Awaited<ReturnType<typeof loadTime>>

/** Sites shown before the rest fold away. */
const TOP_SITES = 5

const KIND_LABEL = (k: ActivityKind) => KIND_INFO[k].label
const sentence = (parts: [string, number][]) => {
  const on = parts.filter(([, s]) => s > 0).map(([name, s], i) => `${i ? name.toLowerCase() : name} ${hm(s)}`)
  return on.length ? on.join(' and ') : 'No learning or deep work yet today'
}


/**
 * Time's page body, from loaded data: the lead card (today's focus over the last 7 days, its legend rows under the
 * chart), the connection when one qualifies, the library (passed in, it reads its own rows), By kind, and the sites.
 * The data loading stays in `page.tsx`; `/dev/ui` renders this from fixtures.
 */
export function TimeBoard({ t, today, link, library }: { t: TimeData; today: string; link: (({ link: PatternLink } | { change: Change }) & { today: string }) | null; library: React.ReactNode }) {
  const id = useId()
  const { s, days, tracked } = t
  const accent = AREAS.time.color
  const OTHER: ActivityKind[] = ['shopping', 'news', 'other']
  const sumDay = (d: string, kinds: ActivityKind[]) => kinds.reduce((a, k) => a + (s.byDay.get(d)?.get(k) ?? 0), 0)
  const perDay = (kinds: ActivityKind[]) => days.map((d) => Math.round(sumDay(d, kinds) / 60))
  const usual = (kinds: ActivityKind[]) => days.reduce((a, d) => a + sumDay(d, kinds), 0) / tracked
  const msgToday = sumDay(today, ['communication']), msgUsual = usual(['communication'])
  // The kinds, grouped by what they mean to the day: focus leads in Time's blue, messages and distraction in neutrals.
  const series = [
    { id: 'focus', name: 'Focus', color: accent, values: perDay(FOCUS) },
    { id: 'messages', name: 'Messages', color: 'var(--surface-3)', values: perDay(['communication']) },
    { id: 'distraction', name: 'Distraction', color: 'color-mix(in oklch, var(--ink-3) 60%, var(--surface))', values: perDay(DISTRACT) },
    ...(OTHER.some((k) => days.some((d) => sumDay(d, [k]))) ? [{ id: 'other', name: 'Other', color: CHART.neutral[2], values: perDay(OTHER) }] : []),
  ]
  const focusStatus = againstUsual('up', t.focusToday, t.focusAvg)
  const kindsSummary = s.byKind.slice(0, 3).map((k) => `${KIND_LABEL(k.kind)} ${Math.round((k.seconds / s.total) * 100)}%`).join(', ') + (s.byKind.length > 3 ? ` and ${s.byKind.length - 3} more` : '')

  return (
    <PageGrid>
      {/* The lead: today's focus over the last 7 days; the three rows under the chart are its legend. */}
      <Card aria-labelledby={`${id}-days`} className={spanClass({ base: 12, lg: 8 }) + ' order-1 grid-lg:order-none'}>
        <h2 id={`${id}-days`} className="font-display text-heading text-ink">Where time went</h2>
        <StatCard
          bare className="mt-3" label="Focus today" color={accent} status={focusStatus} figure={hm(t.focusToday)}
          note={sentence([['Learning', t.todayKinds.get('learning') ?? 0], ['Deep work', t.todayKinds.get('work') ?? 0]])}
          peek={{ type: 'brief', id: areaScope(AREAS.time) }}
        />
        <div className="mt-3">
          <StackedBars
            categories={days.map((d) => (d === today ? 'Today' : formatDay(d, { weekday: 'short' })))}
            series={series}
            unit="min" label={`Minutes per day on the laptop: focus, messages and email, and distraction. Today so far: focus ${hm(t.focusToday)}, messages and email ${hm(msgToday)}, distraction ${hm(t.distractToday)}.`}
            height={240} given endLabels legend={false} accent={accent}
          />
        </div>
        <div className="mt-3 flex flex-col">
          <KindRow swatch={accent} name="Focus" line={`Usual is ${hm(t.focusAvg)} a day this week`} status={focusStatus} />
          <KindRow swatch="color-mix(in oklch, var(--ink-3) 60%, var(--surface))" name="Distraction" line={`${hm(t.distractToday)} today, cap ${hm(DISTRACT_CAP)}`} status={againstCap(t.distractToday, DISTRACT_CAP)} />
          <KindRow swatch="var(--surface-3)" name="Messages and email" line={`${hm(msgToday)} today, ${msgToday && msgUsual && Math.abs(msgToday - msgUsual) / msgUsual < STEADY_BAND ? 'about usual' : `usual is ${hm(msgUsual)} a day`}`} status={againstUsual('none', msgToday, msgUsual)} />
        </div>
        <p className="mt-1 pt-3 text-caption text-ink-3 tabular-nums shadow-[0_-1px_0_var(--divider)]">{hm(t.todayTotal)} on this Mac today · {hm(s.total / tracked)} a day this week</p>
      </Card>

      {/* Beside the lead on a laptop; on a phone the cards join the page's own order (connection, sites, library, by kind). */}
      <div className="contents grid-lg:col-span-4 grid-lg:flex grid-lg:flex-col grid-lg:gap-6 grid-lg:self-start">
        {link ? (
          <Card aria-label="Worth knowing" className={spanClass({ base: 12, lg: 4 }) + ' order-2'}>
            <p className="mb-3 text-label text-ink-2">Worth knowing</p>
            <Connection {...link} />
          </Card>
        ) : null}
        <Card aria-labelledby={`${id}-library`} className={spanClass({ base: 12, lg: 4 }) + ' order-4 pb-3'}>
          <header className="flex items-start justify-between gap-4">
            <h2 id={`${id}-library`} className="font-display text-heading text-ink">Library</h2>
            <Link href="/you/connections" className={buttonLinkClass('text-small')}>How to track</Link>
          </header>
          <p className="mt-1 mb-2 text-small text-ink-3">Courses, shows and series from the extension. Log a module or minutes from a row.</p>
          {library}
        </Card>
        <Fold card title="By kind" summary={kindsSummary} className={spanClass({ base: 12, lg: 4 }) + ' order-5'}>
          <ul className="flex flex-col">
            {s.byKind.map((k) => (
              <li key={k.kind} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5 [&+&]:shadow-[0_-1px_0_var(--divider)]">
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink"><span className="font-medium">{KIND_LABEL(k.kind)}</span> <span className="text-small text-ink-3 tabular-nums">{Math.round((k.seconds / s.total) * 100)}%</span></span>
                  <span className="block truncate text-small text-ink-3">{(s.placesByKind.get(k.kind) ?? []).map((p) => p.name).join(', ')}</span>
                </span>
                <span className="text-body font-medium text-ink tabular-nums">{hm(k.seconds)}</span>
              </li>
            ))}
          </ul>
        </Fold>
      </div>

      {/* Top sites and apps. Every site keeps its "what this counts as" picker; the tail and the page titles fold away. */}
      <Card aria-labelledby={`${id}-sites`} className={spanClass({ base: 12, lg: 12 }) + ' order-3 grid-lg:order-none pb-3'}>
        <header className="flex items-start justify-between gap-4">
          <h2 id={`${id}-sites`} className="font-display text-heading text-ink">Top sites and apps</h2>
          <span className="text-small text-ink-3">Last 7 days</span>
        </header>
        <p className="mt-1 mb-2 text-small text-ink-3">Change what a site counts as and its past time is re-sorted.</p>
        <ul className="flex flex-col">{s.places.slice(0, TOP_SITES).map((p) => <SiteRow key={p.name} p={p} />)}</ul>
        {s.places.length > TOP_SITES ? (
          <Fold title={`${s.places.length - TOP_SITES} more`} summary={s.places.slice(TOP_SITES).map((p) => p.name).join(', ')} className="shadow-[0_-1px_0_var(--divider)]">
            <ul className="flex flex-col">{s.places.slice(TOP_SITES).map((p) => <SiteRow key={p.name} p={p} />)}</ul>
          </Fold>
        ) : null}
        {/* What the time was actually on, across every site and app (a video, a doc, a chat, a course page). */}
        <Fold title="What you spent it on" summary="Top pages and windows" className="shadow-[0_-1px_0_var(--divider)]">
          {s.pages.length ? (
            <ul className="flex flex-col pb-2">
              {s.pages.map((v) => (
                <li key={`${v.place}|${v.title}`} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)]">
                  <Picture of="merchant" name={v.place} />
                  <span className="min-w-0">
                    <span className="block truncate text-body text-ink">{v.title}</span>
                    <span className="block truncate text-small text-ink-3">{[v.place, v.channel, KIND_INFO[v.kind].label].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="w-14 text-end text-body font-medium text-ink tabular-nums">{hm(v.seconds)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="pb-2 text-small text-ink-3">Page titles show up here as you browse: a video, a doc, a chat, a course page.</p>}
        </Fold>
      </Card>
    </PageGrid>
  )
}
