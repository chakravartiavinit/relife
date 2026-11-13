'use client'

import { Flag, Users } from 'lucide-react'
import type { PersonPeek, QuestPeek } from '@/core/peek/types'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Badge } from '../../card'
import { Capsule } from '../../capsule'
import { ContactedButton } from '../../forms/people-forms'
import { RANK_COLOR } from '../../system-quests'
import { PeekLink } from '../peek-link'
import { PeekFooter, PeekIcon, PeekOpen, PeekRow, PeekSection, PeekStats } from '../peek-parts'
import type { Rank } from '@/domain/system'

export function personHeading(d: PersonPeek) {
  return { title: d.name, description: `People · ${d.relation ?? 'keep in touch'}`, icon: <PeekIcon icon={Users} color={CATEGORY.relationships.color} /> }
}

const rhythm = (n: number | null) => (n == null ? 'No rhythm set' : n === 1 ? 'Every day' : n % 7 === 0 ? (n === 7 ? 'Every week' : `Every ${n / 7} weeks`) : `Every ${n} days`)

/** Someone to keep in touch with: when you last talked, their rhythm, and a one-tap "Talked today". */
export function PersonPeekView({ data: d }: { data: PersonPeek }) {
  const total = d.catchUps.reduce((s, c) => s + (c.value ?? 0), 0)
  const max = Math.max(...d.catchUps.map((c) => c.value ?? 0), 1)
  const due = d.dueIn == null ? '–' : d.dueIn < 0 ? `${-d.dueIn}d late` : d.dueIn === 0 ? 'Today' : `in ${d.dueIn}d`
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">{d.overdue ? <Badge color="var(--warn)">Overdue</Badge> : d.since != null ? <Badge color="var(--good)">In touch</Badge> : <Badge>Not yet</Badge>}</div>
      <div className="mt-4"><PeekStats items={[{ label: 'Last talked', value: d.since == null ? 'Never' : d.since === 0 ? 'Today' : `${d.since}d ago`, sub: d.lastContacted ?? undefined }, { label: 'Rhythm', value: rhythm(d.contactEveryDays) }, { label: 'Next', value: due }]} /></div>
      <div className="mt-4"><ContactedButton id={d.id} name={d.name} /></div>

      <PeekSection label="Catch-ups, 30 days" aside={`${formatNumber(total)} with anyone`}>
        <div role="img" aria-label={`${total} catch-ups in the last 30 days`} className="flex h-14 items-end gap-[3px]">
          {d.catchUps.map((c) => <span key={c.date} className="min-w-0 flex-1 rounded-t-xs" style={{ height: `${Math.max(c.value ? 12 : 4, ((c.value ?? 0) / max) * 100)}%`, background: c.value ? CATEGORY.relationships.color : 'var(--surface-3)' }} />)}
        </div>
      </PeekSection>
      {d.notes ? <PeekSection label="Notes"><p className="text-small text-ink-2">{d.notes}</p></PeekSection> : null}
      <PeekFooter><PeekOpen href="/people">Open People</PeekOpen></PeekFooter>
    </div>
  )
}

export function questHeading(d: QuestPeek) {
  const area = d.area in CATEGORY ? CATEGORY[d.area as keyof typeof CATEGORY] : null
  return { title: d.title, description: d.period, icon: <PeekIcon icon={Flag} color={area?.color ?? 'var(--pill)'} /> }
}

const STATE = { active: 'In progress', cleared: 'Cleared', failed: 'Missed', unverified: 'No data', cancelled: 'Cancelled', expired: 'Expired' } as const

/** A System quest or this week's quest: what it asks, progress, rank and reward. */
export function QuestPeekView({ data: d }: { data: QuestPeek }) {
  const unit = d.unit ?? ''
  const state = STATE[d.status as keyof typeof STATE] ?? d.status
  const fmt = (v: number) => `${formatNumber(v, 1)}${unit && d.source === 'system' ? ` ${unit}` : ''}`
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={d.status === 'cleared' ? 'var(--good)' : d.status === 'failed' ? 'var(--warn)' : undefined}>{state}</Badge>
        {d.rank ? <Badge color={RANK_COLOR[d.rank as Rank]}>Rank {d.rank}</Badge> : null}
        {d.xp ? <Badge>{d.xp} XP</Badge> : null}
      </div>
      {d.reason ? <p className="mt-3 text-small text-ink-2">{d.reason}</p> : null}

      <PeekSection label="Progress">
        <p className="num text-title text-ink tabular-nums">{d.progress == null ? '–' : fmt(d.progress)} <span className="text-heading font-semibold text-ink-3">of {fmt(d.target)}{d.source === 'weekly' ? ' days' : ''}</span></p>
        <Capsule className="mt-3" value={d.progress ?? 0} max={d.target} label={`${d.title} progress`} />
        {d.progress == null ? <p className="mt-2 text-caption text-ink-3">No data yet. An unknown measurement is not a miss.</p> : null}
      </PeekSection>

      <PeekSection label="Details">
        <PeekRow label="Counts">{d.measure}</PeekRow>
        {d.baseline != null ? <PeekRow label="Your usual">{fmt(d.baseline)}</PeekRow> : null}
        {d.difficulty != null ? <PeekRow label="Difficulty">{d.difficulty} of 5</PeekRow> : null}
      </PeekSection>
      {d.statSlug ? (
        <div className="mt-4"><PeekLink to={{ type: 'metric', id: d.statSlug }} className="text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">See the trend behind it</PeekLink></div>
      ) : null}
      <PeekFooter><PeekOpen href="/you">Open Progress</PeekOpen></PeekFooter>
    </div>
  )
}
