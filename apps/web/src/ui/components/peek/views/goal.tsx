'use client'

import brand from '@relife/brand/brand.json'
import { CalendarCheck, CalendarClock, ChartLine, CircleDashed, Repeat, Target } from 'lucide-react'
import type { GoalPeek } from '@/core/peek/types'
import { CATEGORY } from '@/ui/tokens'
import { Capsule } from '../../capsule'
import { GoalStatusBadge } from '../../goals/goal-card'
import { GoalDetailActions } from '../../goals/goal-detail-actions'
import { CheckInList, GoalHistory } from '../../goals/goal-history'
import { CheckInPanel } from '../../goals/goal-review'
import { coverageLine, day, directionLabel, fill, measureLine, movement, target, value, weekday } from '../../goals/format'
import { PeekFooter, PeekIcon, PeekOpen, PeekSection, PeekStats } from '../peek-parts'

export function goalHeading(d: GoalPeek) {
  return { title: d.goal.title, description: `${CATEGORY[d.goal.area].label} · goal · ${measureLine(d.goal)}`, icon: <PeekIcon icon={Target} color={CATEGORY[d.goal.area].color} /> }
}

/** An outcome goal: baseline, now and target, progress, check-in, linked actions, history and the weekly decisions. */
export function GoalPeekView({ data: d }: { data: GoalPeek }) {
  const g = d.goal
  const color = CATEGORY[g.area].color
  const o = g.snapshot?.outcome
  const move = movement(g)
  const s = g.snapshot
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2"><GoalStatusBadge g={g} />{g.status !== 'active' ? <span className="text-caption text-ink-3 capitalize">{g.status}</span> : null}</div>
      {g.reason ? <p className="mt-3 text-small text-ink-2">{g.reason}</p> : null}

      <PeekSection label="Progress" className="mt-4">
        <PeekStats items={[
          { label: 'Baseline', value: value(g.baselineValue, g.unit), sub: day(g.baselineDate) },
          { label: g.measureKind === 'check_in' ? 'Latest' : 'Now', value: o?.current != null ? value(o.current, g.unit) : '—', sub: g.measureKind === 'check_in' ? (o?.latestCheckIn ? day(o.latestCheckIn.localDate) : 'No check-in yet') : `Last ${s?.window.days ?? 7} days` },
          { label: 'Target', value: target(g), sub: `by ${day(g.targetDate)}` },
        ]} />
        <Capsule className="mt-4" value={fill(s)} color={color} label={`Progress toward ${g.title}`} />
        <div className="mt-2 flex justify-between gap-3 text-caption text-ink-3 tabular-nums"><span>{move?.since ?? 'No current value yet'}</span><span>{move?.left ?? ''}</span></div>
        <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-3 tabular-nums">
          {o?.status === 'not_enough_data' ? <CircleDashed className="size-3.5" strokeWidth={1.5} aria-hidden /> : <CalendarCheck className="size-3.5" strokeWidth={1.5} aria-hidden />}
          {coverageLine(g)}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-caption text-ink-3"><CalendarClock className="size-3.5" strokeWidth={1.5} aria-hidden />Next review {weekday(g.nextReviewOn)} · {directionLabel(g.direction).toLowerCase()}</p>
        {g.trackerArchived ? <p className="mt-2 text-caption text-ink-2">Tracker archived. Change the measure or finish the goal.</p> : null}
        {g.sensitive ? <p className="mt-2 text-caption text-ink-3">{brand.name} won’t set quests or suggest changes for this measure.</p> : null}
      </PeekSection>

      {g.measureKind === 'check_in' && g.status !== 'finished' ? (
        <PeekSection label="Check-in"><CheckInPanel g={g} today={d.today} full /></PeekSection>
      ) : null}
      {g.measureKind === 'check_in' ? <PeekSection label="Check-ins"><CheckInList rows={d.checkIns} unit={g.unit} /></PeekSection> : null}

      <PeekSection label="Linked actions" aside={s ? `${day(s.window.from)}–${day(s.window.to)}` : undefined}>
        <ul className="flex flex-col gap-3">
          {(s?.actions ?? []).map((a) => (
            <li key={`${a.kind}:${a.id}`}>
              <div className="flex items-baseline justify-between gap-2 text-small">
                <span className={`flex min-w-0 items-center gap-1.5 truncate ${a.available ? 'font-medium text-ink' : 'text-ink-3'}`}>
                  {a.kind === 'schedule' ? <Repeat className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden /> : <ChartLine className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />}{a.name}
                </span>
                <span className="shrink-0 text-caption text-ink-3 tabular-nums">{!a.available ? 'No longer available' : a.kind === 'schedule' ? (a.due ? `${a.done} of ${a.due} days` : 'Nothing due') : `recorded ${a.recordedDays ?? 0} of ${a.windowDays} days`}</span>
              </div>
              {a.available && a.kind === 'schedule' && a.due ? <Capsule size="sm" className="mt-1.5" value={a.done ?? 0} max={a.due} color={color} label={`${a.name} adherence`} /> : null}
            </li>
          ))}
          {!s?.actions.length ? <li className="text-small text-ink-3">No actions linked.</li> : null}
        </ul>
      </PeekSection>

      <PeekSection label="History"><GoalHistory unit={g.unit} startedOn={g.startedOn} baseline={`Baseline ${value(g.baselineValue, g.unit)}, ${g.baselineHow}`} rows={d.history} /></PeekSection>

      <div className="mt-6"><GoalDetailActions g={g} picker={d.picker} today={d.today} activeCount={d.activeCount} reviewDue={d.reviewDue} /></div>
      <PeekFooter><PeekOpen href={`/plan/goals/${g.id}`}>Open full page</PeekOpen></PeekFooter>
    </div>
  )
}
