import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Plus } from 'lucide-react'
import { CATEGORIES } from '@/db/schema'
import { CATEGORY } from '@/ui/tokens'
import { Button } from '@/ui/components/button'
import { Badge, Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { Capsule, CapsuleGauge } from '@/ui/components/capsule'
import { Field, Input, Segmented, Select } from '@/ui/components/form'
import { EmptyState } from '@/ui/components/empty'
import { CapsuleMark, Wordmark } from '@/ui/components/logo'
import { DailyBars, RankedBars, Sparkline, TrendArea } from '@/ui/components/charts'
import { BeuiGallery } from '@/ui/components/gallery-beui'

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
              <code className="text-[11px] text-ink-3">--{c}</code>
            </div>
          ))}
        </div>
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
              <div className="mb-2 flex justify-between text-[13px]"><span className="text-ink">{CATEGORY[c].label}</span><span className="text-ink-3 tabular-nums">{(i + 1) * 20}%</span></div>
              <Capsule value={(i + 1) * 20} max={100} color={CATEGORY[c].color} label={CATEGORY[c].label} />
            </div>
          ))}
          <div><div className="mb-2 text-[13px] text-ink">Empty</div><Capsule value={0} label="Empty" /></div>
          <div><div className="mb-2 text-[13px] text-ink">Sizes</div><div className="flex flex-col gap-2"><Capsule value={3} max={5} size="sm" label="sm" /><Capsule value={3} max={5} size="lg" label="lg" /></div></div>
        </div>
        <div className="mt-6 flex items-end gap-4 rounded-lg p-4" style={{ background: 'linear-gradient(180deg, var(--sky-soft), var(--surface-2))' }}>
          {CATEGORIES.map((c, i) => <CapsuleGauge key={c} value={i} max={4} color={CATEGORY[c].color} label={CATEGORY[c].label} />)}
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

      <Section title="Charts">
        {/* EvilCharts reads the clock while animating, so the samples render per request, not at build time. */}
        <Suspense fallback={<Skeleton className="h-[420px]" />}><ChartSamples /></Suspense>
      </Section>

      <Section title="From beui.dev">
        <BeuiGallery />
      </Section>

      <Section title="Empty & loading">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-md bg-surface-2 p-4"><EmptyState title="Nothing here yet" description="Empty states use the line-art style." action={<Button variant="primary">Add one</Button>} /></div>
          <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-24" /><Skeleton className="h-5 w-24" /></div>
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
