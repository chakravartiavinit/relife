import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Check, Ellipsis, Plus } from 'lucide-react'
import { CATEGORIES } from '@/db/schema'
import { CATEGORY } from '@/ui/tokens'
import { Button } from '@/ui/components/button'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { Field, Input, Segmented, Select } from '@/ui/components/form'
import { EmptyState } from '@/ui/components/empty'
import { CapsuleMark, Wordmark } from '@/ui/components/logo'
import { DailyBars, RankedBars, Sparkline, TrendArea } from '@/ui/components/charts'
import { BeuiGallery } from '@/ui/components/gallery-beui'
import { PositionCard } from '@/ui/components/wealth/position-card'
import { IlloGallery } from '@/ui/components/tour/illos'
import { ToastGallery } from '@/ui/components/toast'
import { AREA_ART } from '@/ui/area-art'
import { RANKS, type Rank } from '@/domain/system'
import { Bar, SplitBar } from '@/ui/components/kit/bar'
import { AreaChip } from '@/ui/components/kit/area-chip'
import { Group, ItemRow } from '@/ui/components/kit/group'
import { Hero } from '@/ui/components/kit/hero'
import { KeyCards } from '@/ui/components/kit/key-cards'
import { Kbd } from '@/ui/components/kit/kbd'
import { Lane, Lanes } from '@/ui/components/kit/lanes'
import { PageTabs } from '@/ui/components/kit/page-tabs'
import { Pill } from '@/ui/components/kit/pill'
import { QuestCard } from '@/ui/components/kit/quest-card'
import { RankLetter } from '@/ui/components/kit/rank'
import { Ring } from '@/ui/components/kit/ring'
import { StatCard } from '@/ui/components/kit/stat-card'
import { WeekStrip, type WeekDay } from '@/ui/components/kit/week-strip'
import { IconTile } from '@/ui/components/routine-art'

export const metadata: Metadata = { title: 'UI gallery' }

// Every component in every state, light and dark (toggle in the sidebar).
// This is the review surface for UI changes; no Storybook.

const days = Array.from({ length: 21 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 10 + i))
  return { date: d.toISOString().slice(0, 10), value: i === 6 ? null : Math.round(5 + 3 * Math.sin(i / 2) + (i % 3)) }
})

export default function UiGallery() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Dev" title="UI gallery" description="Components and states. Check both themes before merging UI changes." />

      <NewParts />

      <Section title="Brand">
        <div className="flex flex-wrap items-end gap-10">
          <Wordmark className="h-20" />
          <Wordmark className="h-10" />
          <CapsuleMark className="size-16" title="ReLife app icon" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {['bg', 'sidebar', 'raised', 'raised-2', 'hover', 'accent', 'mint', 'amber', 'red', 'health', 'mind', 'skills', 'wealth', 'hobbies', 'people', 'rank-a', 'rank-s'].map((c) => (
            <div key={c} className="flex flex-col gap-1.5">
              <div className="h-12 rounded-md shadow-1" style={{ background: `var(--${c})` }} />
              <code className="font-mono text-[11px] text-ink-3">--{c}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button size="sm"><Plus className="size-4" strokeWidth={1.5} /> Small</Button>
          <Button size="lg" variant="primary">Large</Button>
          <Button size="icon" aria-label="Add"><Plus className="size-4" strokeWidth={1.5} /></Button>
          <Button static>Static (no press)</Button>
        </div>
      </Section>

      <Section title="Capsules">
        <div className="grid gap-5 sm:grid-cols-2">
          {CATEGORIES.map((c, i) => (
            <div key={c}>
              <div className="mb-2 flex justify-between text-[13px]"><span className="text-ink">{CATEGORY[c].label}</span><span className="text-ink-3 tabular-nums">{(i + 1) * 20}%</span></div>
              <Capsule value={(i + 1) * 20} max={100} color={CATEGORY[c].color} label={CATEGORY[c].label} />
            </div>
          ))}
          <div><div className="mb-2 text-[13px] text-ink">Empty</div><Capsule value={0} label="Empty" /></div>
          <div><div className="mb-2 text-[13px] text-ink">Sizes</div><div className="flex flex-col gap-2"><Capsule value={3} max={5} size="sm" label="sm" /><Capsule value={3} max={5} size="lg" label="lg" /></div></div>
        </div>
      </Section>

      <Section title="Stats & badges">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Sleep" value="7.2h" sub="+0.4h vs last week" tone="good" />
          <Stat label="Spent" value="₹12,480" sub="+18% vs last month" tone="bad" />
          <Stat label="Commits" value="42" sub="This week" />
          <Stat label="Empty" value={<span className="text-ink-3">–</span>} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          {CATEGORIES.map((c) => <Badge key={c} color={CATEGORY[c].color}>{CATEGORY[c].label}</Badge>)}
          <Badge>0</Badge><Badge>1</Badge><Badge>99+</Badge>
          <Badge color="var(--good)">Connected</Badge>
          <Badge color="var(--warn)">Waiting</Badge>
          <Badge color="var(--bad)">Error</Badge>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="g-name" hint="Hint text"><Input id="g-name" placeholder="Morning skincare" /></Field>
          <Field label="Category" htmlFor="g-cat"><Select id="g-cat" defaultValue="health">{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}</Select></Field>
          <Field label="Disabled" htmlFor="g-dis"><Input id="g-dis" disabled defaultValue="Read only" /></Field>
        </div>
        <div className="mt-4"><Segmented name="g-seg" defaultValue="daily" options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} /></div>
      </Section>

      <Section title="Open positions">
        {/* Sample numbers: one trade in profit, one in loss and close to liquidation. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <PositionCard index={0} coin="XAU" name="Gold" pnl="+₹687"
            pos={{ symbol: 'XAUUSDT', side: 'short', size: -1.7, entry: 4055.27, mark: 4050.97, liquidation: 4174.9, unrealized: 7.3, leverage: 100, notional: -6879, margin: 68.79, marginType: 'cross' }} />
          <PositionCard index={1} coin="ETH" name="Ethereum" pnl="−₹4,210"
            pos={{ symbol: 'ETHUSDT', side: 'long', size: 0.5, entry: 3200, mark: 3080, liquidation: 2990, unrealized: -60, leverage: 20, notional: 1540, margin: 80, marginType: 'isolated' }} />
        </div>
      </Section>

      <Section title="Charts">
        {/* EvilCharts reads the clock while animating, so the samples render per request, not at build time. */}
        <Suspense fallback={<Skeleton className="h-[420px]" />}><ChartSamples /></Suspense>
      </Section>

      <Section title="From beui.dev">
        <BeuiGallery />
      </Section>

      <Section title="Toasts">
        <ToastGallery />
      </Section>

      <Section title="Tour illustrations">
        <IlloGallery />
      </Section>

      <Section title="Empty & loading">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-md bg-raised-2 p-4"><EmptyState title="Nothing here yet" description="A 48px tile, a title, one line and one action." action={<Button variant="primary">Add one</Button>} /></div>
          <div className="flex flex-col gap-3 rounded-md bg-raised-2 p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-24" /><Skeleton className="h-5 w-24" /></div>
        </div>
      </Section>
    </div>
  )
}

async function ChartSamples() {
  await connection()
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div><div className="mb-2 text-[13px] text-ink-2">Daily bars with target</div><DailyBars data={days} target={7} unit="h" label="Daily bars sample" color={CATEGORY.skills.color} /></div>
      <div><div className="mb-2 text-[13px] text-ink-2">Trend with gap</div><TrendArea data={days} target={7} unit="h" label="Trend sample" color={CATEGORY.health.color} /></div>
      <div><div className="mb-2 text-[13px] text-ink-2">Ranked</div><RankedBars label="Ranked sample" unit="₹" data={[{ label: 'Food delivery', value: 6120 }, { label: 'Groceries', value: 4380 }, { label: 'Transport', value: 1920 }]} color={CATEGORY.wealth.color} /></div>
      <div><div className="mb-2 text-[13px] text-ink-2">Sparkline</div><div className="w-40"><Sparkline data={days} color={CATEGORY.mind.color} /></div></div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      {children}
    </Card>
  )
}


const week = (states: WeekDay['state'][], counts?: number[]): WeekDay[] =>
  states.map((state, i) => ({ date: `2026-11-${String(9 + i).padStart(2, '0')}`, label: 'MTWTFSS'[i], state, count: counts?.[i] }))

const check = <span className="block size-[22px] rounded-full shadow-[inset_0_0_0_1.5px_var(--check-ring)]" />
const done = <span className="grid size-[22px] place-items-center rounded-full bg-mint text-on-accent"><Check className="size-3" strokeWidth={3} /></span>
const overdue = <span className="block size-[22px] rounded-full shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--red)_75%,transparent)]" />
const menu = <span className="grid size-8 place-items-center rounded-sm text-ink-3 hover:bg-hover"><Ellipsis className="size-4" strokeWidth={1.5} /></span>

/** The v2 "Hero + lanes" parts, every state. Both themes: toggle in the rail. */
function NewParts() {
  return (
    <>
      <Section title="Hero band">
        <div className="overflow-hidden rounded-lg shadow-1">
          <Hero
            className="!m-0"
            meta={<><span>Wed 11 Nov</span><span className="text-ink-4">·</span><span>17:01 IST</span></>}
            title="Good evening, Aarav"
            lede={<><span className="font-medium text-bad">2 routines are overdue</span> and <b className="font-medium text-ink">Call parents</b> is up next in 59 min.</>}
            pills={<><Pill count={2} tone="bad" href="#">Overdue <span className="font-normal text-ink-3">since 07:00</span></Pill><Pill href="#">Claude Pro <span className="font-normal text-ink-3">renews tomorrow</span></Pill></>}
            center={<Ring value={248} max={400} size={152} label="Level 3, 248 of 400 XP" center={<><span className="font-mono text-[11px] tracking-[0.08em] text-ink-3">LV</span><span className="text-[40px] leading-[44px] font-semibold tracking-[-0.03em] tabular-nums">3</span></>} />}
            side={<StatCard label="Streak" art="/routines/energy.png" value="4" unit="days" sub="Best 9 · 1 freeze held"><WeekStrip days={week(['kept', 'kept', 'missed', 'kept', 'today', 'future', 'future'])} /></StatCard>}
            tabs={<PageTabs label="Demo" current="/a" items={[{ href: '/a', label: 'Routines', count: 9 }, { href: '/b', label: 'Trackers' }, { href: '/c', label: 'Needs a look', count: 3 }]} />}
          />
        </div>
      </Section>

      <Section title="Rings and bars">
        <div className="flex flex-wrap items-center gap-8">
          {[0, 62, 100].map((p) => <Ring key={p} value={p} max={100} size={96} stroke={6} label={`${p}%`} center={<span className="font-mono text-[12px]">{p}%</span>} />)}
          <Ring value={3} max={4} size={72} stroke={6} color="var(--health)" label="3 of 4" center={<span className="font-mono text-[12px]">3/4</span>} />
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {([3, 4, 6, 8] as const).map((z) => <div key={z}><div className="mb-2 font-mono text-[11px] text-ink-3">{z}px</div><Bar value={62} max={100} size={z} color="var(--accent)" label={`${z}px`} /></div>)}
          <div><div className="mb-2 font-mono text-[11px] text-ink-3">with usual-by-now marker</div><Bar value={0.9} max={2.5} size={8} color="var(--water-text)" marker={{ at: 1.5, label: 'Usual by now: 1.5 L' }} label="Water" /></div>
          <div><div className="mb-2 font-mono text-[11px] text-ink-3">empty</div><Bar value={0} size={6} label="Empty" /></div>
          <div><div className="mb-2 font-mono text-[11px] text-ink-3">split</div><SplitBar parts={[{ value: 30, color: 'var(--mint)', label: 'Earned' }, { value: 185, color: 'var(--accent)', label: 'Quests' }, { value: 99, color: 'var(--amber)', label: 'Routines' }]} /></div>
        </div>
      </Section>

      <Section title="Ranks, chips, pills, keys">
        <div className="flex flex-wrap items-center gap-2">{RANKS.map((r) => <RankLetter key={r} rank={r} />)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">{RANKS.map((r) => <RankLetter key={r} rank={r} size={28} />)}</div>
        <div className="mt-4 flex flex-wrap gap-2">{CATEGORIES.map((c) => <AreaChip key={c} area={c} />)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill count={2} tone="bad" href="#">Overdue</Pill>
          <Pill count={1} tone="warn">Refill</Pill>
          <Pill count={4} tone="info">Nudges</Pill>
          <Pill>Plain</Pill>
          <Kbd>⌘K</Kbd><Kbd>esc</Kbd><Kbd>N</Kbd>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {(['md', 'base', 'lg'] as const).map((z) => <IconTile key={z} src="/routines/run.png" tint="var(--health)" size={z} />)}
          {CATEGORIES.map((c) => <IconTile key={c} src={AREA_ART[c]} tint={CATEGORY[c].color} />)}
        </div>
      </Section>

      <Section title="Week strips">
        <div className="grid gap-6 sm:grid-cols-2">
          <WeekStrip days={week(['kept', 'kept', 'missed', 'kept', 'today', 'future', 'future'])} />
          <WeekStrip days={week(['kept', 'frozen', 'kept', 'kept', 'kept', 'kept', 'today'])} tone="mint" />
          <WeekStrip days={week(['kept', 'missed', 'kept', 'kept', 'today', 'future', 'future'], [7, 0, 9, 8, 3, 0, 0])} />
        </div>
      </Section>

      <Section title="Stat cards and key cards">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="XP today" art="/routines/sparkles.png" value="+30" unit="XP" sub="185 open from quests"><SplitBar parts={[{ value: 30, color: 'var(--mint)', label: 'Earned' }, { value: 185, color: 'var(--accent)', label: 'Quests' }]} /></StatCard>
          <StatCard label="Focus" value="2h 10m" sub="vs 1h 40m usual" />
          <StatCard label="Empty" value={<span className="text-ink-4">–</span>} />
        </div>
        <KeyCards className="mt-6" items={[
          { art: '/routines/check.png', label: 'Done today', value: '3 of 9', sub: '6 to go' },
          { art: '/routines/energy.png', label: 'Best streak', value: '9 days', sub: 'Current 4' },
          { art: '/routines/water.png', label: 'Water', value: '0.9 L', sub: 'Usual by now 1.5 L' },
          { art: '/routines/money.png', label: 'Spent', value: '₹0', sub: 'No orders yet' },
        ]} />
      </Section>

      <Section title="Lanes, groups and rows">
        <Lanes>
          <Lane title="Your day" count="3 of 9">
            <Group name="Now" count={2} now icon={<Ellipsis />} right={<span className="text-bad">overdue</span>}>
              <ItemRow tone="overdue" tile={<IconTile src="/routines/pill.png" tint="var(--health)" size="md" />} title="Vitamin D" sub="1 tablet · 12 left" area={<AreaChip area="health" />} time="07:00" xp="+11" action={overdue} menu={menu} />
              <ItemRow tone="next" tile={<IconTile src="/routines/call.png" tint="var(--people)" size="md" />} title="Call parents" sub="Weekly" area={<AreaChip area="relationships" />} time="18:00" xp="+11" action={check} menu={menu} />
            </Group>
            <Group name="Morning" count="1 of 2">
              <ItemRow tile={<IconTile src="/routines/gym.png" tint="var(--health)" size="md" />} title="Workout with a long routine name that has to truncate somewhere" sub="45 min" area={<AreaChip area="health" />} time="07:30" xp="+11" action={done} />
            </Group>
          </Lane>
          <Lane title="At a glance">
            <Card><CardHeader art="/routines/water.png" color="var(--skills)" title="Water" description="0.9 of 2.5 L" action="36%" /><Bar value={0.9} max={2.5} size={8} color="var(--water-text)" marker={{ at: 1.5, label: 'Usual by now' }} label="Water" /></Card>
          </Lane>
        </Lanes>
      </Section>

      <Section title="Quest cards">
        <div className="grid gap-4 sm:grid-cols-3">
          {RANKS.map((r: Rank) => <QuestCard key={r} rank={r} art="/routines/run.png" title={`Rank ${r} quest`} xp={r.charCodeAt(0) * 3} progress={r === 'S' ? 18 : 6.4} target={r === 'S' ? 30 : 10} foot="6.4 / 10 km · 3 days left" />)}
          <QuestCard rank="C" art="/routines/mood.png" title="Log your mood" xp={20} progress={0} target={1} action={<Button size="sm">Log mood</Button>} />
          <QuestCard rank="D" kind="penalty" art="/routines/phone.png" title="Under 2 h of social" xp={60} progress={1.2} target={2} foot="1.2 / 2 h" />
          <QuestCard rank="B" kind="emergency" art="/routines/money.png" title="Spending spike: skip delivery today" xp={90} progress={0} target={1} foot="0 / 1" />
        </div>
      </Section>

      <Section title="Page tabs">
        <PageTabs label="Demo" current="/a" items={[{ href: '/a', label: 'Overview' }, { href: '/b', label: 'Spending', count: 12 }, { href: '/c', label: 'Portfolio' }]} />
        <PageTabs label="Demo" current="" mode="jump" items={[{ href: '#a', label: 'Overview' }, { href: '#b', label: 'Sleep' }, { href: '#c', label: 'Activity' }]} />
      </Section>
    </>
  )
}
