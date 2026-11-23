import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Brain, Droplets, HeartPulse, Plus, Wallet } from 'lucide-react'
import { CATEGORIES } from '@/db/schema'
import { hasTrend } from '@/domain/series'
import { CATEGORY } from '@/ui/tokens'
import { Button } from '@/ui/components/button'
import { Badge, Card, CardHeader, IconChip, PageHeader, SectionLabel, Skeleton, Stat, SystemLabel } from '@/ui/components/card'
import { Capsule, CapsuleGauge, LevelBar } from '@/ui/components/capsule'
import { CapsuleIcon } from '@/ui/components/capsule-icon'
import { Field, Input, Segmented, Select } from '@/ui/components/form'
import { EmptyState } from '@/ui/components/empty'
import { CapsuleMark, Wordmark } from '@/ui/components/logo'
import { DailyBars, RankedBars, ShareDonut, Sparkline, StackedBars, TrendArea } from '@/ui/components/charts'
import { CalmGallery } from '@/ui/components/calm-gallery'
import { TimeGallery } from '@/ui/components/time-gallery'
import { LoaderGallery } from '@/ui/components/loader-gallery'
import { BeuiGallery } from '@/ui/components/gallery-beui'
import { PositionCard } from '@/ui/components/wealth/position-card'
import { IlloGallery } from '@/ui/components/tour/illos'
import { ToastGallery } from '@/ui/components/toast'
import { DemoGallery } from '@/ui/components/demo-gallery'
import { CaptureGallery } from '@/ui/components/capture/capture-gallery'
import { PeekGallery } from '@/ui/components/peek/peek-gallery'
import { CoachGallery } from '@/ui/components/coach/coach-gallery'
import { PartyGallery } from '@/ui/components/party/party-gallery'
import { AreaGallery } from '@/ui/components/area/area-gallery'
import { OverviewGallery } from '@/ui/components/area/overview-gallery'
import { WealthGallery } from '@/ui/components/wealth/wealth-gallery'
import { TodayGallery } from '@/ui/components/today/today-gallery'
import { PlanYouGallery } from '@/ui/components/plan-you-gallery'
import { OnboardingGallery } from '@/ui/components/onboarding-gallery'
import { ImportGallery } from '@/ui/components/imports/import-gallery'
import { ShareGallery } from '@/ui/components/share/share-gallery'
import { TemplatesGallery } from '@/ui/components/templates/templates-gallery'
import { builtInPacks } from '@/core/packs'
import { TEMPLATES } from '@/core/onboarding'
import { FoldDemo, PageGridDemo, PageHeaderDemo, PageHeaderPlainDemo, RailDemo } from '@/ui/components/layout-gallery'
import { InstalledBeuiGallery, PeekLinkDemo, SegmentTabsDemo, SheetDemo, ShellDemo, TypeScale } from '@/ui/components/gallery-foundations'
import { RecoveryPanel, SystemQuests } from '@/ui/components/system-quests'
import type { RecoveryView } from '@/domain/recovery'
import { GOAL_FOOTNOTE, goalSnapshot } from '@/domain/goals'
import { GoalFolds, GoalsBoard } from '@/ui/components/goals/goal-card'
import { DevicesGallery } from '@/ui/components/devices/gallery'
import { DataGallery } from '@/ui/components/data/data-gallery'
import { PhoneGallery } from '@/ui/components/devices/phone-gallery'
import { REACH_DOCKER, REACH_LONG, REACH_NOTHING, REACH_TAILSCALE } from '@/ui/fixtures/phone'
import { GoalReviewCard } from '@/ui/components/goals/goal-review'
import type { GoalViewData } from '@/ui/components/goals/format'

export const metadata: Metadata = { title: 'UI gallery' }

// Every component in every state, light and dark (toggle in the sidebar).
// This is the review surface for UI changes; no Storybook.

const days = Array.from({ length: 21 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 9, 10 + i))
  return { date: d.toISOString().slice(0, 10), value: i === 6 ? null : Math.round(5 + 3 * Math.sin(i / 2) + (i % 3)) }
})

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']
// Eleven categories whose spending starts in April: the first four months are empty.
const SPEND_SAMPLE = ['Food delivery', 'Groceries', 'Shopping', 'Transport', 'Bills', 'Health', 'Travel', 'Fun', 'Gifts', 'Fees', 'Misc'].map((name, i) => ({
  id: name.toLowerCase(), name, color: 'var(--sky)',
  values: MONTHS.map((_, j) => (j < 4 ? null : Math.round((12 - i) * 900 + ((j * 7 + i * 3) % 5) * 700))),
}))
const SHARE_SAMPLE = ['Gold', 'Ether', 'Index fund', 'Bitcoin', 'Bonds', 'Cash', 'Silver', 'Other'].map((name, i) => ({ id: name, name, color: 'var(--pill)', value: 9000 - i * 1100 }))

const recoverySample: RecoveryView = {
  id: '00000000-0000-4000-8000-000000000000', version: 1, localDate: '2026-11-11', choice: null, questId: null,
  missed: [{ id: 'sample-miss', title: 'Push 4 commits', progress: 1, target: 4, unit: null }],
  preview: { parentId: 'sample-miss', statId: 'tracker:github.commits', metric: 'Commits', title: 'Push 1 commit', target: 1, unit: null, op: 'gte', aggregation: 'sum', fromDate: '2026-11-11', toDate: '2026-11-11', rank: 'E', xp: 20, area: 'skills', baseline: 2 },
}

export default function UiGallery() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Dev" title="UI gallery" description="Components and states. Check both themes before merging UI changes." />

      <Section title="Type scale">
        <TypeScale />
      </Section>

      <Section title="Brand">
        <div className="flex flex-wrap items-end gap-10">
          <Wordmark className="h-20" />
          <Wordmark className="h-10" />
          <CapsuleMark className="size-16" title="ReLife app icon" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {['ink', 'pill', 'pill-ink', 'line-blue', 'sky', 'sakura', 'cardigan', 'night'].map((c) => (
            <div key={c} className="flex flex-col gap-1.5">
              <div className="h-12 rounded-md shadow-1" style={{ background: `var(--${c})` }} />
              <code className="text-caption text-ink-3">--{c}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Loader: splash, page and inline, progress, reduced motion, Finish runs the hand-off">
        <LoaderGallery />
      </Section>

      <Section title="Calm system: status words, stat card, status row, pictures, connection, insight line, fold, empty state, lead chart, routine row, buttons, tabs, chips">
        <CalmGallery />
      </Section>

      <Section title="Time: focus today over the last 7 days, its legend rows, the connection, library, By kind and top sites, from fixtures">
        <Suspense fallback={<div className="h-96 rounded-xl bg-surface-2" />}><TimeGallery /></Suspense>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent</Button>
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
              <div className="mb-2 flex justify-between text-small"><span className="text-ink">{CATEGORY[c].label}</span><span className="text-ink-3 tabular-nums">{(i + 1) * 20}%</span></div>
              <Capsule value={(i + 1) * 20} max={100} color={CATEGORY[c].color} label={CATEGORY[c].label} />
            </div>
          ))}
          <div><div className="mb-2 text-small text-ink">Empty</div><Capsule value={0} label="Empty" /></div>
          <div><div className="mb-2 text-small text-ink">Sizes</div><div className="flex flex-col gap-2"><Capsule value={3} max={5} size="sm" label="sm" /><Capsule value={3} max={5} size="lg" label="lg" /></div></div>
        </div>
        <div className="mt-6 flex items-end gap-4 rounded-lg bg-surface-2 p-4">
          {CATEGORIES.map((c, i) => <CapsuleGauge key={c} value={i} max={4} color={CATEGORY[c].color} label={CATEGORY[c].label} />)}
        </div>
        <div className="mt-8 mb-3 text-small text-ink-3">LevelBar: the segmented stat bar for XP, level and goal progress (10 segments, the last one by its fraction)</div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><div className="mb-2 flex justify-between text-small"><span className="text-ink">XP to Lv 26</span><span className="text-ink-3 tabular-nums">64%</span></div><LevelBar value={64} max={100} size="lg" label="XP to Lv 26" /></div>
          {CATEGORIES.slice(0, 3).map((c, i) => (
            <div key={c}><div className="mb-2 flex justify-between text-small"><span className="text-ink">{CATEGORY[c].label}</span><span className="text-ink-3 tabular-nums">{[12, 55, 100][i]}%</span></div><LevelBar value={[12, 55, 100][i]} max={100} color={CATEGORY[c].color} label={CATEGORY[c].label} /></div>
          ))}
          <div><div className="mb-2 text-small text-ink">Empty, and sm with 12 segments</div><div className="flex flex-col gap-2"><LevelBar value={0} label="Empty" /><LevelBar value={7} max={12} size="sm" segments={12} label="sm" /></div></div>
        </div>
        <div className="mt-8 mb-3 text-small text-ink-3">CapsuleIcon: flat top, ink outline</div>
        <div className="flex items-end gap-5">
          <CapsuleIcon size="sm" letter="A" /><CapsuleIcon size="md" letter="A" /><CapsuleIcon size="lg" letter="A" />
          <CapsuleIcon size="lg" icon={HeartPulse} color={CATEGORY.health.color} /><CapsuleIcon size="lg" icon={Brain} color={CATEGORY.mind.color} /><CapsuleIcon size="lg" icon={Wallet} color={CATEGORY.wealth.color} />
        </div>
      </Section>

      <Section title="Stats & badges">
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6"><SystemLabel>Monday · 23 November</SystemLabel><SystemLabel color={CATEGORY.health.color}>Health</SystemLabel><span className="text-small text-ink-3">SystemLabel: banners only</span></div>
          <SectionLabel rule action={<a href="#" className="text-small font-medium text-ink-2 hover:text-ink">Open Life</a>}>Life pulse (SectionLabel with rule and action)</SectionLabel>
          <SectionLabel as="div">Renews this week (SectionLabel inside a card)</SectionLabel>
          <div className="flex items-center gap-3 text-small text-ink-2">
            <IconChip color={CATEGORY.health.color}><HeartPulse /></IconChip><IconChip color={CATEGORY.wealth.color}><Wallet /></IconChip><IconChip><Droplets /></IconChip>IconChip: a neutral well, the icon in the area colour
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Sleep" value="7.2h" sub="+0.4h vs last week" tone="good" />
          <Stat label="Spent" value="₹12,480" sub="+18% vs last month" tone="bad" />
          <Stat label="Commits" value="42" sub="This week" />
          <Stat label="Empty" value={<span className="text-ink-3">–</span>} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          {CATEGORIES.map((c) => <Badge key={c} color={CATEGORY[c].color}>{CATEGORY[c].label}</Badge>)}
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

      <Section title="Capture">
        <CaptureGallery />
      </Section>

      <Section title="Sheet">
        <SheetDemo />
      </Section>

      <Section title="Segment tabs">
        <SegmentTabsDemo />
      </Section>

      <Section title="Page grid: 12 / 8 / 1 columns, spans per tier">
        <PageGridDemo />
      </Section>

      <Section title="Page head: label, title, brief, summary, underline tabs, actions">
        <PageHeaderDemo />
        <div className="mt-8"><PageHeaderPlainDemo /></div>
      </Section>

      <Section title="Rail: the last card grows so both columns end together">
        <RailDemo />
      </Section>

      <Section title="Fold: closed, open, card, inline">
        <FoldDemo />
      </Section>

      <Section title="Peek link">
        <PeekLinkDemo />
      </Section>

      <Section title="Peek views">
        {/* The metric view draws EvilCharts, which read the clock, so it renders per request too. */}
        <Suspense fallback={<Skeleton className="h-[420px]" />}><PeekSamples /></Suspense>
      </Section>

      <Section title="Area template and Life hub">
        <Suspense fallback={<Skeleton className="h-[420px]" />}><AreaGallery /></Suspense>
      </Section>

      <Section title="Area Overview: targets table, sleep chart, Wealth Overview">
        <Suspense fallback={<Skeleton className="h-[420px]" />}><OverviewGallery /></Suspense>
      </Section>

      <Section title="Wealth: Overview, day bars, category rows, habit and transactions">
        <Suspense fallback={<Skeleton className="h-[900px] rounded-lg" />}><WealthGallery /></Suspense>
      </Section>

      <Section title="Coach: Needs you, Ask and no model">
        {/* The rows format a routine's rhythm with the current date, so this streams in. */}
        <Suspense fallback={<Skeleton className="h-[480px] rounded-lg" />}><CoachGallery /></Suspense>
      </Section>

      <Section title="Party and People on this server: the card in every state, the list, invites">
        <Suspense fallback={<Skeleton className="h-[480px] rounded-lg" />}><PartyGallery /></Suspense>
      </Section>

      <Section title="Today: header, attention, pulse, timeline, rail, first day and all done">
        <Suspense fallback={<Skeleton className="h-[640px] rounded-lg" />}><TodayGallery /></Suspense>
      </Section>

      <Section title="Plan and You: review card, Your sources, suggestions, connect success, notification channel">
        <PlanYouGallery />
      </Section>

      <Section title="Data & privacy: backups in every state, delete, the privacy list">
        <DataGallery />
      </Section>

      <Section title="Setup: the six steps (You, Pack, Areas, Connect, AI, Routines) and the save file">
        <OnboardingGallery templates={TEMPLATES} packs={builtInPacks()} />
      </Section>

      <Section title="File import: pick, columns, running, result, Past imports">
        <ImportGallery />
      </Section>

      <Section title="Share cards: the dialog in each state, every card, look and size">
        <ShareGallery />
      </Section>

      <Section title="Templates: the window in each state (sources, preview, share my setup)">
        <TemplatesGallery />
      </Section>

      <Section title="Shell pieces">
        <ShellDemo />
      </Section>

      <Section title="beUI: installed for the redesign">
        <InstalledBeuiGallery />
      </Section>

      <Section title="Toasts (with Undo)">
        <ToastGallery />
      </Section>

      <Section title="Demo mode (read-only)">
        <DemoGallery />
      </Section>

      <Section title="System recovery">
        <p className="mb-4 text-[13px] text-ink-3">Synthetic examples. Choices require a real Today recovery record before the server can save them.</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <Card><RecoveryPanel recovery={recoverySample} /></Card>
          <Card><RecoveryPanel recovery={{ ...recoverySample, preview: null }} /></Card>
          <Card><RecoveryPanel recovery={{ ...recoverySample, choice: 'rest' }} /></Card>
          <Card><RecoveryPanel recovery={{ ...recoverySample, choice: 'smaller', questId: 'sample-recovery' }} /></Card>
          <Card><SystemQuests difficulty={2} hasData timezone="Asia/Kolkata" quests={[
            { id: 'sample-unverified', title: 'Practice for 45 minutes', kind: 'daily', status: 'unverified', reason: null, rank: 'E', xp: 20, target: 45, progress: null, op: 'gte', unit: 'min', toDate: '2026-11-10' },
            { id: 'sample-retired', title: 'An old penalty quest', kind: 'penalty', status: 'cancelled', reason: null, rank: 'E', xp: 25, target: 4, progress: null, op: 'gte', unit: null, toDate: '2026-11-10' },
          ]} /></Card>
        </div>
      </Section>

      <Section title="Outcome goals">
        <p className="mb-4 text-[13px] text-ink-3">Synthetic examples. Menus, decisions and check-ins need real goals on /goals before the server can save them.</p>
        <div className="grid gap-6">
          <GoalsBoard picker={goalPicker} today={goalToday} feeds={{ 'sample-goal': { peeks: [null], change: { parts: [{ text: 'Typing speed up 8% this week: ', bold: false }, { text: '66 wpm', bold: true }, { text: ' a day vs your usual ', bold: false }, { text: '61 wpm', bold: true }, { text: '.', bold: false }], caption: 'This week against the 4 before', peek: null } } }} goals={[
            goalSample,
            checkInSample,
            { ...goalSample, id: 'sample-sensitive', title: 'Sleep 7–8 hours a night', measureName: 'Sleep', unit: 'h', direction: 'range', target: null, rangeLow: 7, rangeHigh: 8, baselineValue: 7.4, sensitive: true, snapshot: snap({ ...goalSample, direction: 'range', target: null, rangeLow: 7, rangeHigh: 8, baselineValue: 7.4 }, 6.4, true) },
          ]} />
          <GoalFolds activeCount={2} goals={[
            { ...goalSample, id: 'sample-paused', title: 'Run 5 km in under 30 minutes', status: 'paused', pausedAt: new Date('2026-11-02T08:00:00Z'), pausedOn: '2026-11-02' },
            { ...goalSample, id: 'sample-finished', title: 'Read 20 pages a day', status: 'finished', finishedAt: new Date('2026-10-04T08:00:00Z'), snapshot: { ...goalSample.snapshot!, met: false } },
          ]} />
        </div>
        <div className="mt-6 max-w-[760px]">
          <GoalReviewCard g={goalSample} picker={goalPicker} today={goalToday}
            review={{ id: 'sample-review', reviewDate: goalToday, snapshot: goalSample.snapshot!, aiNote: 'Practice landed on most due days.', proposal: { field: 'targetDate', value: '2027-03-12', why: 'A month more keeps the weekly step modest.' },
              lines: ['Actions: Practice DSA: done on 5 of 6 due days.', 'Outcome: 64 wpm (6 recordings) vs 60 wpm at baseline.', GOAL_FOOTNOTE],
              prompt: 'You kept the actions and the outcome moved the right way. Keep for another period?', decision: null }} />
        </div>
      </Section>

      <Section title="Connecting devices">
        <Suspense fallback={<Skeleton className="h-[420px]" />}><DeviceSamples /></Suspense>
      </Section>

      <Section title="Phone setup and Push channel">
        <PhoneGallery nothing={REACH_NOTHING} tailscale={REACH_TAILSCALE} long={REACH_LONG} docker={REACH_DOCKER} />
      </Section>

      <Section title="Tour illustrations">
        <IlloGallery />
      </Section>

      <Section title="Empty & loading">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-md bg-surface-2 p-4"><EmptyState title="Nothing here yet" description="Empty states use the line-art style." action={<Button variant="primary">Add one</Button>} /></div>
          <div className="rounded-md bg-surface-2 p-4"><EmptyState icon={HeartPulse} color={CATEGORY.health.color} title="No sleep logged" description="Connect a source or log it by hand." action={<Button>Log sleep</Button>} /></div>
          <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-24" /><Skeleton className="h-5 w-24" /></div>
        </div>
      </Section>
    </div>
  )
}

// Counts down to a time, so it renders per request.
async function DeviceSamples() {
  await connection()
  return <DevicesGallery now={Date.now()} />
}

async function PeekSamples() {
  await connection()
  return <PeekGallery />
}

async function ChartSamples() {
  await connection()
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div><div className="mb-2 text-[13px] text-ink-2">Daily bars with target</div><DailyBars data={days} target={7} unit="h" label="Daily bars sample" color={CATEGORY.skills.color} /></div>
      <div><div className="mb-2 text-[13px] text-ink-2">Trend with gap</div><TrendArea data={days} target={7} unit="h" label="Trend sample" color={CATEGORY.health.color} /></div>
      <div><div className="mb-2 text-[13px] text-ink-2">Ranked</div><RankedBars label="Ranked sample" unit="₹" data={[{ label: 'Food delivery', value: 6120 }, { label: 'Groceries', value: 4380 }, { label: 'Transport', value: 1920 }]} color={CATEGORY.wealth.color} /></div>
      <div><div className="mb-2 text-small text-ink-2">Sparkline, drawn only when hasTrend ({String(hasTrend(days))}); two points: {String(hasTrend(days.slice(0, 2)))}</div><div className="w-40"><Sparkline data={days} color={CATEGORY.mind.color} /></div></div>
      <div className="lg:col-span-2"><div className="mb-2 text-small text-ink-2">Stacked bars: 11 series, 4 empty leading months. The lead in the accent, two neutrals, the rest as Other; the legend stops at four</div><StackedBars label="Stacked sample" unit="₹" height={260} categories={MONTHS} series={SPEND_SAMPLE} /></div>
      <div><div className="mb-2 text-small text-ink-2">Stacked bars with a single series</div><StackedBars label="One series" unit="₹" height={160} categories={MONTHS} series={SPEND_SAMPLE.slice(0, 1)} /></div>
      <div><div className="mb-2 text-small text-ink-2">Share donut: 8 segments, top 3 and Other</div><ShareDonut label="Share sample" unit="₹" totalLabel="held" segments={SHARE_SAMPLE} /></div>
      <div><div className="mb-2 text-small text-ink-2">Share donut: area colours are kept</div><ShareDonut label="XP by area" totalLabel="XP" segments={CATEGORIES.map((c, i) => ({ id: c, name: CATEGORY[c].label, color: CATEGORY[c].color, value: 120 - i * 15 }))} /></div>
    </div>
  )
}

const goalToday = '2026-11-15'
const goalBase = {
  reason: 'Faster notes in meetings.', area: 'skills' as const, status: 'active' as const, measureKind: 'tracker' as const, trackerId: 'sample-tracker',
  measureName: 'Typing speed', unit: 'wpm', direction: 'increase' as const, target: 70, rangeLow: null, rangeHigh: null,
  baselineValue: 60, baselineDate: '2026-10-25', baselineHow: 'Average of 17 recorded days', baselineObservations: 17,
  targetDate: '2027-02-10', cadence: 'weekly' as const, nextReviewOn: goalToday, version: 1, pausedAt: null, finishedAt: null,
  trackerArchived: false, startedOn: '2026-10-20', pausedOn: null, finishedOn: null,
}
function snap(g: Omit<GoalViewData, 'id' | 'snapshot' | 'sensitive' | 'actionNames' | 'actions' | 'title'> & { title?: string }, latest: number, sensitive = false) {
  const days = new Map(['2026-11-08', '2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map((d, i) => [d, latest - 2 + i * 0.6]))
  return goalSnapshot({ title: g.title ?? '', ...g }, { days }, [{ link: { kind: 'schedule', id: 'sample-routine' }, source: { kind: 'schedule', name: 'Practice DSA', statuses: ['done', 'done', 'missed', 'done', 'done', 'done', 'none'] } }], goalToday, sensitive, new Date('2026-11-15T08:00:00Z'))
}
const goalSample: GoalViewData = { ...goalBase, id: 'sample-goal', title: 'Type 70 words a minute', actions: [{ kind: 'schedule', id: 'sample-routine' }], actionNames: ['Practice DSA'], sensitive: false, snapshot: snap(goalBase, 64) }
const checkInSample: GoalViewData = {
  ...goalBase, id: 'sample-checkin', title: 'Play Blackbird at 90 bpm', area: 'hobbies', measureKind: 'check_in', trackerId: null, measureName: 'Clean tempo', unit: 'bpm',
  target: 90, baselineValue: 66, baselineHow: 'Metronome, best of 3', baselineObservations: null, actions: [{ kind: 'tracker', id: 'sample-guitar' }], actionNames: ['Guitar'], sensitive: false,
  snapshot: goalSnapshot({ ...goalBase, title: '', measureKind: 'check_in', target: 90, baselineValue: 66 }, { checkIns: [] }, [], goalToday, false, new Date('2026-11-15T08:00:00Z')),
}
const goalPicker = { trackers: [], routines: [{ id: 'sample-routine', name: 'Practice DSA', category: 'skills' as const }] }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      {children}
    </Card>
  )
}
