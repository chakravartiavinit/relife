import Link from 'next/link'
import { ChartColumn, Flame, Hourglass, Tv } from 'lucide-react'
import { AREAS } from '@/core/areas'
import { hoursText, loadHobbies } from '@/core/areas/hobbies'
import { addDays, formatDay } from '@/core/time'
import type { User } from '@/core/user'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { AllMetrics } from '../components/area/all-metrics'
import { BrandLogo } from '../components/brand-logo'
import { Capsule } from '../components/capsule'
import { Card, CardHeader } from '../components/card'
import { DailyBars, Sparkline } from '../components/charts'
import { EmptyState } from '../components/empty'
import { AddHobbyButton, PracticeButtons } from '../components/hobbies'
import { HobbyCollage, HobbyImage } from '../components/hobby-image'
import { LibraryGrid } from '../components/library'
import { PeekLink } from '../components/peek/peek-link'

const def = AREAS.hobbies

/** Practice bars, one card per hobby with one-tap practice, shows you watch, then every metric (listening, chess ratings, playtime). */
export async function HobbiesOverview({ user, today }: { user: User; today: string }) {
  const { from, cards, shows, all } = await loadHobbies(user, today)
  const color = def.color
  // Shows and anime you track from the browser extension.
  const watching = shows.length ? (
    <Card>
      <CardHeader title="Watching" icon={<Tv strokeWidth={2} />} color="var(--cat-health)" description="Shows and anime you track with the ReLife extension. Time on them counts as entertainment." />
      <LibraryGrid items={shows} />
    </Card>
  ) : null
  const metrics = <AllMetrics user={user} def={def} today={today} />

  if (!cards.length) {
    return (
      <>
        <Card>
          <EmptyState
            art={<HobbyCollage />} title="No hobbies yet"
            description="Add one you want to get better at, like guitar, drawing or chess. Log practice in a tap, or type “guitar 30” in Telegram."
            action={<AddHobbyButton />}
          />
        </Card>
        {watching}
        {metrics}
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader title="Practice, last 4 weeks" icon={<ChartColumn strokeWidth={2} />} color={color} description="Minutes a day across every hobby." />
        <DailyBars data={fillDays(all, addDays(today, -27), today, 0)} color={color} unit="min" label="Practice minutes per day" />
      </Card>

      <section aria-label="Your hobbies" className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.t.id} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <HobbyImage name={c.t.name} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-heading text-ink">
                  <PeekLink to={{ type: 'metric', id: c.t.slug }} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{c.t.name}</PeekLink>
                </h2>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-3 tabular-nums">
                  <span className="inline-flex items-center gap-1"><Flame className="size-3.5" strokeWidth={1.5} aria-hidden style={{ color: c.streak ? 'var(--warn)' : undefined }} />{c.streak ? `${c.streak}-day streak` : 'No streak'}</span>
                  <span className="inline-flex items-center gap-1"><Hourglass className="size-3.5" strokeWidth={1.5} aria-hidden />{hoursText(c.total)} in total</span>
                  <span>Last: {c.last}</span>
                </p>
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-small tabular-nums">
                <span className="font-medium text-ink">{hoursText(c.thisWeek)} this week</span>
                <span className="text-ink-3">{c.goal ? `goal ${hoursText(c.goal)}` : 'no goal'}</span>
              </div>
              <Capsule value={c.thisWeek} max={c.goal ?? Math.max(c.thisWeek, 1)} color={color} label={`${c.t.name}: ${c.thisWeek} of ${c.goal ?? c.thisWeek} minutes this week`} />
            </div>
            {c.ratings.length || c.games != null ? (
              <ul className="flex flex-wrap gap-2" aria-label={`${c.t.name} stats`}>
                {c.games != null ? (
                  <li className="flex h-9 items-center gap-2 rounded-md bg-surface-2 px-2.5 text-small tabular-nums">
                    <span className="font-semibold text-ink">{c.games}</span><span className="text-ink-3">games this week</span>
                    {c.games && c.wins != null ? <span className="font-medium text-good">· {Math.round((c.wins / c.games) * 100)}% won</span> : null}
                  </li>
                ) : null}
                {c.ratings.map((r) => (
                  <li key={r.name} className="flex h-9 items-center gap-2 rounded-md bg-surface-2 ps-1 pe-2.5 text-small tabular-nums">
                    <BrandLogo name={r.name} className="size-7 rounded-sm" />
                    <span className="font-semibold text-ink">{formatNumber(r.value)}</span>
                    {r.change ? <span className={r.change > 0 ? 'font-medium text-good' : 'font-medium text-bad'}>{r.change > 0 ? '▲' : '▼'} {formatNumber(Math.abs(r.change))}</span> : null}
                    <span className="text-ink-3">30 days</span>
                  </li>
                ))}
              </ul>
            ) : /chess/i.test(c.t.name) ? (
              <p className="text-small text-ink-3">
                Play online? <Link href="/you/connections" className="font-medium text-pill-ink hover:underline">Connect Lichess or Chess.com</Link> and your games, time and rating sync on their own.
              </p>
            ) : null}
            {c.spark.some((p) => (p.value ?? 0) > 0) ? <Sparkline data={c.spark} color={color} height={40} label={`${c.t.name}, minutes per day for 4 weeks`} /> : null}
            <PracticeButtons slug={c.t.slug} name={c.t.name} color={color} />
          </Card>
        ))}
      </section>

      {watching}
      {metrics}
      <p className="px-1 text-small text-ink-3">Tip: type “{cards[0].t.slug.replace(/-/g, ' ')} 30” in ⌘K or Telegram to log 30 minutes. Since {formatDay(from)}.</p>
    </>
  )
}
