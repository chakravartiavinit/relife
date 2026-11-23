import { addDays } from '@/core/time'
import type { Change, Link, Signal } from '@/domain/patterns'
import { STATUSES } from '@/domain/status-of'
import { PEEK_SAMPLE_REFS } from '../fixtures/calm'
import type { PictureRef } from '../picture'
import { Agenda, type AgendaRow } from './agenda'
import { Button, buttonLinkClass } from './button'
import { Card, CardHeader } from './card'
import { LeadChart } from './charts'
import { Chip } from './chip'
import { Connection } from './connection'
import { EmptyState } from './empty'
import { Fold } from './fold'
import { InsightLine } from './insight-line'
import { Picture, type PictureSize } from './picture'
import { SegmentTabs } from './segment-tabs'
import { StatCard } from './stat-card'
import { StatusRow } from './status-row'
import { StatusWord } from './status-word'

// "Calm system" in /dev/ui: every calm component in light and dark, from fixtures. Each pane carries its own
// `data-theme`, so both themes show at once on either page theme.

const TODAY = '2026-11-23'

const signal = (id: string, name: string, area: string, f: (i: number) => number, unit?: string): Signal => ({
  id, name, area, group: id, unit, direction: 'up',
  days: new Map(Array.from({ length: 28 }, (_, i) => [addDays(TODAY, i - 27), f(i)] as const)),
})
const routines = signal('routines', 'Routines done', 'mind', (i) => 6 + 3 * Math.sin(i * 0.9))
const sleep = signal('tracker:sleep.hours', 'Sleep', 'health', (i) => 7 + 0.8 * Math.sin(i * 0.9 + 1.2) - (i > 20 ? 0.6 : 0), 'h')
const mood = signal('tracker:mood', 'Mood', 'mind', (i) => 3.8 + 0.5 * Math.sin(i * 0.7) - (i > 20 ? 0.6 : 0))
const LINK: Link = { a: routines, b: sleep, lag: 1, rho: 0.52, n: 42, high: 7.6, low: 6.8, split: 8 }
const CHANGE: Change = { signal: mood, recent: 3.5, usual: 4.1, pct: -0.15, with: [{ signal: sleep, pct: -0.08 }] }

const NIGHTS = [7.4, 6.1, 7.8, 6.6, 7.9, 7.2, 5.9, 6.4, 7.5, 8.1, 7.3, 6.2, 6.9, 7.2].map((value, i) => ({ date: addDays(TODAY, i - 13), value }))

const ROWS: AgendaRow[] = [
  { key: 'a', scheduleId: 'calm-a', occurrence: `${TODAY}T08:00:00Z`, time: '08:00', name: 'Morning skincare', kind: 'routine', color: 'var(--cat-health)', area: 'health', detail: 'cleanser, serum, sunscreen', status: 'missed' },
  { key: 'b', scheduleId: 'calm-b', occurrence: `${TODAY}T22:00:00Z`, time: '22:00', name: 'Journal', kind: 'routine', color: 'var(--cat-mind)', area: 'mind', detail: 'Three lines', status: 'pending' },
  { key: 'c', scheduleId: 'calm-c', occurrence: `${TODAY}T07:00:00Z`, time: '07:00', name: 'Gym', kind: 'routine', color: 'var(--cat-health)', area: 'health', detail: 'Push, pull, legs', status: 'done' },
]

function Pane({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="flex min-w-0 flex-col gap-4 rounded-xl bg-bg p-5 text-ink shadow-1">
      <p className="text-caption text-ink-3">{theme === 'light' ? 'Light' : 'Dark'}</p>
      {children}
    </div>
  )
}

/** One part of the catalogue: its name and the use, then the same content in both themes. */
function Part({ title, use, children }: { title: string; use: string; children: () => React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-divider pt-6 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-display text-heading text-ink">{title}</h3>
        <p className="max-w-[80ch] text-small text-ink-3">{use}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane theme="light">{children()}</Pane>
        <Pane theme="dark">{children()}</Pane>
      </div>
    </section>
  )
}

const LISTS: { name: string; size: Exclude<PictureSize, 20 | 56>; rows: { picture: PictureRef; name: string; line: string }[] }[] = [
  { name: 'Areas and trackers (routine and nav pictures, 32)', size: 32, rows: [
    { picture: { of: 'tracker', name: 'Sleep' }, name: 'Sleep', line: '7.2 h last night, near your target' },
    { picture: { of: 'area', to: 'mind' }, name: 'Mind', line: 'Mood lower than usual this week' },
    { picture: { of: 'hobby', name: 'Guitar' }, name: 'Guitar', line: '3 sessions this week' },
    { picture: { of: 'category', name: 'Dairy & eggs' }, name: 'Dairy and eggs', line: '₹1,240 this month' },
  ] },
  { name: 'Merchants and services (brand logos, a category picture and a letter as fallbacks, 32)', size: 32, rows: [
    { picture: { of: 'merchant', name: 'Swiggy Instamart' }, name: 'Swiggy Instamart', line: '3 orders this week' },
    { picture: { of: 'merchant', name: 'Blinkit' }, name: 'Blinkit', line: 'App icon, fills its tile' },
    { picture: { of: 'merchant', name: 'Nandini Sweets', category: 'Food delivery' }, name: 'Nandini Sweets', line: 'No logo: the category picture' },
    { picture: { of: 'merchant', name: 'Corner Pharmacy' }, name: 'Corner Pharmacy', line: 'No logo, no category: a letter' },
  ] },
  { name: 'Connectors, AI providers, devices and coins (40, a lead list)', size: 40, rows: [
    { picture: { of: 'connector', id: 'github' }, name: 'GitHub', line: 'Synced 6 minutes ago' },
    { picture: { of: 'connector', id: 'telegram' }, name: 'Telegram', line: 'Coach messages' },
    { picture: { of: 'provider', id: 'anthropic' }, name: 'Claude', line: 'Answers and briefs' },
    { picture: { of: 'provider', id: 'local' }, name: 'Ollama', line: 'On this computer' },
    { picture: { of: 'device', name: 'iPhone' }, name: 'Aarav’s iPhone', line: 'Paired 3 days ago' },
    { picture: { of: 'device', name: 'Mac' }, name: 'MacBook Pro', line: 'Paired 12 days ago' },
    { picture: { of: 'coin', symbol: 'BTC' }, name: 'Bitcoin', line: 'Held on Binance' },
    { picture: { of: 'achievement', id: 'week-one', tier: 'silver' }, name: 'Week one', line: 'Unlocked 12 Nov' },
    { picture: { of: 'achievement', id: 'hundred-days', tier: 'gold', unlocked: false }, name: 'A hundred days', line: '58 of 100' },
  ] },
]

const KINDS: [string, PictureRef][] = [
  ['nav', { of: 'nav', to: '/wealth' }], ['area', { of: 'area', to: 'relationships' }], ['routine', { of: 'routine', name: 'Morning skincare' }],
  ['tracker', { of: 'tracker', name: 'Water' }], ['hobby', { of: 'hobby', name: 'Chess' }], ['category', { of: 'category', name: 'Groceries' }],
  ['merchant', { of: 'merchant', name: 'Netflix' }], ['connector', { of: 'connector', id: 'strava' }], ['provider', { of: 'provider', id: 'openai' }],
  ['coin', { of: 'coin', symbol: 'ETH' }], ['device', { of: 'device', name: 'phone' }], ['achievement', { of: 'achievement', id: 'first-commit', tier: 'bronze' }],
  ['library', { of: 'library', id: 'demo', title: '100xDevs Cohort 3', provider: 'YouTube' }], ['letter', { of: 'merchant', name: 'Corner Pharmacy' }],
]

export function CalmGallery() {
  return (
    <div className="flex flex-col gap-8">
      <Part title="Status words" use="Six words from statusOf(): goal pace, tracker week, change this week, month pace. A word with a dot in the text-safe ink, never a chip; Quiet has a hollow dot.">
        {() => <div className="flex flex-wrap gap-x-5 gap-y-2">{STATUSES.map((s) => <StatusWord key={s} status={s} />)}</div>}
      </Part>

      <Part title="Stat card" use="One figure (Fraunces), a status word, one line. The label has the area dot or, with a picture, the 20px picture. With peek the whole card opens it.">
        {() => (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Sleep" color="var(--cat-health)" status="Steady" figure="7.2 h" note="Last night, a little under 7.5 h" peek={PEEK_SAMPLE_REFS.metric} />
            <StatCard label="Spent today" picture={{ of: 'merchant', name: 'Swiggy' }} status="Quiet" figure="₹145" note="₹1,820 under a usual day" />
          </div>
        )}
      </Part>

      <Part title="Status row and Picture" use="Picture, name, one line, status word, chevron to its Peek. One picture size per list. Brand logo, connector logo, coin, routine, hobby, category or area picture, medal, library cover, or the lettered fallback.">
        {() => (
          <div className="flex flex-col gap-5">
            {LISTS.map((l) => (
              <div key={l.name}>
                <p className="mb-1 text-caption text-ink-3">{l.name}</p>
                <Card as="div" className="px-5 py-2">
                  {l.rows.map((r, i) => (
                    <StatusRow key={r.name} picture={r.picture} pictureSize={l.size} name={r.name} line={r.line}
                      status={l.size === 32 ? (['Steady', 'Slipping', 'Ahead', 'Quiet'] as const)[i % 4] : undefined} peek={l.size === 32 ? PEEK_SAMPLE_REFS.metric : undefined} />
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </Part>

      <Part title="Picture sizes" use="20 inline (toasts, text), 32 the row slot, 40 a lead row, 56 an empty state. Every kind of thing, each at 20, 32, 40 and 56. A library cover comes from /api/library/<id>/image and is full-bleed; here the item has none, so its provider's logo shows.">
        {() => (
          <div className="grid grid-cols-[auto_repeat(4,auto)] items-center gap-x-5 gap-y-2 justify-start">
            {KINDS.map(([name, ref]) => (
              <div key={name} className="contents">
                <span className="pr-2 text-small text-ink-2">{name}</span>
                {([20, 32, 40, 56] as const).map((s) => <Picture key={s} {...ref} size={s} />)}
              </div>
            ))}
          </div>
        )}
      </Part>

      <Part title="Connection" use="Link (same or next day) and change (this week against usual), with or without the two-line sparkline. The sentence is describeLink / describeChange, key figures in bold; See the days opens the metric's Peek.">
        {() => (
          <div className="flex flex-col gap-4">
            <Card><Connection link={LINK} today={TODAY} spark /></Card>
            <Card><Connection link={LINK} /></Card>
            <Card><Connection change={CHANGE} today={TODAY} spark /></Card>
            <Card><Connection change={CHANGE} /></Card>
          </div>
        )}
      </Part>

      <Part title="Insight line" use="The screen's one answer as a sentence; Why? opens a Peek (peek) or unfolds the facts (why).">
        {() => (
          <div className="flex flex-col gap-4">
            <InsightLine peek={PEEK_SAMPLE_REFS.brief}>Sleep down 18% this week: 6.1 h vs your usual 7.4 h.</InsightLine>
            <InsightLine why="Sleep tracker, the last 7 nights against the 4 weeks before. Changes under 10% are not shown.">Sleep down 18% this week: 6.1 h vs your usual 7.4 h.</InsightLine>
          </div>
        )}
      </Part>

      <Part title="Fold" use="Secondary detail: a row of chevron, title and one line of what is inside; open, the body. Only the chevron turns.">
        {() => (
          <Card as="div" className="px-5 py-2">
            <Fold title="3 done" summary="Gym, Vitamin D3, Omega-3"><p className="py-2 text-small text-ink-2">Gym, Vitamin D3 and Omega-3 are done for today.</p></Fold>
            <Fold title="Finish setting up" summary="4 of 7" defaultOpen>
              <div className="flex flex-col gap-1 py-2">
                <p className="font-display text-heading text-ink">Get reminders on Telegram</p>
                <p className="text-small text-ink-3">Check things off with one tap from your phone.</p>
                <div className="mt-2 flex gap-2"><Button variant="secondary" size="sm">Connect Telegram</Button><Button variant="quiet" size="sm">Hide setup</Button></div>
              </div>
            </Fold>
          </Card>
        )}
      </Part>

      <Part title="Empty state" use="A 3D picture, one line, up to two actions.">
        {() => (
          <Card as="div">
            <EmptyState picture={{ of: 'routine', name: 'Morning skincare' }} title="Nothing planned today" description="Add routines like skincare or medicines and they show up here, with reminders on Telegram."
              action={<Button variant="primary">Add a routine</Button>} secondary={<Button variant="secondary">Log something</Button>} />
          </Card>
        )}
      </Part>

      <Part title="Lead chart" use="The one chart of a screen: direction over time, a dashed reference named at its end, filled dots on the right side of it, the last value written on the line.">
        {() => (
          <Card as="div">
            <CardHeader title="Sleep, last 14 nights" description="On target 8 of 14 nights" action={<StatusWord status="Slipping" />} />
            <div className="mt-3"><LeadChart data={NIGHTS} color="var(--cat-health)" unit="h" reference={{ value: 7.5 }} label="Sleep, last 14 nights against 7.5 h" height={240} /></div>
          </Card>
        )}
      </Part>

      <Part title="Routine row" use="Time, 3D picture, name, one meta line, check ring. Overdue is the time in bad ink plus the word. Skip appears on hover or focus.">
        {() => <Card as="div"><Agenda rows={ROWS} /></Card>}
      </Part>

      <Part title="Buttons, link, tabs and chips" use="One primary and secondary pair, a quiet button, one underlined link, underlined tabs, chips only for filters.">
        {() => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">Check off</Button><Button variant="secondary">+250 ml</Button><Button variant="quiet">Skip</Button>
              <a href="#calm" className={buttonLinkClass()}>Edit in Plan</a>
            </div>
            <SegmentTabs variant="underline" label="Calm tabs sample" pathname="/dev/ui" tabs={[
              { href: '/dev/ui#overview', label: 'Overview' }, { href: '/dev/ui#trends', label: 'Trends' }, { href: '/dev/ui#routines', label: 'Routines' }, { href: '/dev/ui#sources', label: 'Sources' },
            ]} />
            <div className="flex flex-wrap gap-2"><Chip selected count={11}>All</Chip><Chip count={4}>Health</Chip><Chip count={3}>Mind</Chip><Chip count={1}>Skills</Chip></div>
          </div>
        )}
      </Part>

      <Part title="Peek header picture" use="peekHeading() can return a picture: it is drawn at 40px before the title. Toasts take the same ref as a 20px picture in the tile (Toasts section: With a picture).">
        {() => (
          <Card as="div" className="flex items-start gap-3">
            <Picture of="tracker" name="Sleep" size={40} />
            <div className="min-w-0"><h4 className="font-display text-heading text-ink">Sleep</h4><p className="text-small text-ink-3">Health · 7.2 h last night</p></div>
          </Card>
        )}
      </Part>
    </div>
  )
}
