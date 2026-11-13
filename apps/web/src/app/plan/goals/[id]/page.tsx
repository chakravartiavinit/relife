import type { Metadata } from 'next'
import { connection } from 'next/server'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ClipboardCheck, Repeat, Target } from 'lucide-react'
import { loadGoalDetail } from '@/core/goals'
import { getUser } from '@/core/user'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, PageHeader, Skeleton, Stat } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { GoalStatusBadge } from '@/ui/components/goals/goal-card'
import { GoalDetailActions } from '@/ui/components/goals/goal-detail-actions'
import { CheckInList, GoalHistory } from '@/ui/components/goals/goal-history'
import { CheckInPanel } from '@/ui/components/goals/goal-review'
import { coverageLine, day, directionLabel, fill, measureLine, movement, target, value } from '@/ui/components/goals/format'

export const metadata: Metadata = { title: 'Goal' }

export default function GoalDetailPage({ params }: PageProps<'/plan/goals/[id]'>) {
  return (
    <Suspense fallback={<div aria-busy><Skeleton className="mb-6 h-[150px] rounded-[24px]" /><Skeleton className="h-[360px] rounded-lg" /></div>}>
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: PageProps<'/plan/goals/[id]'>['params'] }) {
  await connection()
  const [{ id }, user] = await Promise.all([params, getUser()])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await loadGoalDetail(user, id)
  if (!data) notFound()
  const g = data.goal
  const color = CATEGORY[g.area].color
  const o = g.snapshot?.outcome
  const move = movement(g)
  const s = g.snapshot
  return (
    <div>
      <PageHeader
        eyebrow={CATEGORY[g.area].label}
        title={g.title}
        description={g.reason}
        actions={<GoalDetailActions g={g} picker={data.picker} today={data.today} activeCount={data.activeCount} reviewDue={!!data.due} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader icon={<Target strokeWidth={1.5} />} color={color} title="Progress" description={measureLine(g)} action={<GoalStatusBadge g={g} />} />
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Baseline" value={value(g.baselineValue, g.unit)} sub={day(g.baselineDate)} />
              <Stat label={g.measureKind === 'check_in' ? 'Latest' : 'Now'} value={o?.current != null ? value(o.current, g.unit) : '—'} sub={g.measureKind === 'check_in' ? (o?.latestCheckIn ? day(o.latestCheckIn.localDate) : 'No check-in yet') : `Last ${s?.window.days ?? 7} days`} />
              <Stat label="Target" value={target(g)} sub={directionLabel(g.direction)} />
            </div>
            <Capsule className="mt-5" value={fill(s)} color={color} label={`Progress toward ${g.title}`} />
            <div className="mt-2 flex justify-between gap-3 text-[12.5px] text-ink-3 tabular-nums">
              <span>{move?.since ?? 'No current value yet'}</span><span>{move?.left ?? ''}</span>
            </div>
            <p className="mt-4 text-[12.5px] text-ink-3 tabular-nums">{coverageLine(g)} · Baseline: {g.baselineHow}</p>
            {g.sensitive ? <p className="mt-2 text-[12.5px] text-ink-3">ReLife won’t set quests or suggest changes for this measure.</p> : null}
            {g.measureKind === 'check_in' ? (
              <div className="mt-5">
                <h3 className="mb-2 font-mono text-[11.5px] font-semibold tracking-[0.08em] text-ink-2 uppercase">Check-ins</h3>
                <CheckInList rows={data.checkIns} unit={g.unit} />
              </div>
            ) : null}
          </Card>
          {g.measureKind === 'check_in' && g.status !== 'finished' ? (
            <Card>
              <CardHeader icon={<ClipboardCheck strokeWidth={1.5} />} color={color} title="Check-in" description={g.baselineHow} />
              <CheckInPanel g={g} today={data.today} full />
            </Card>
          ) : null}
        </div>
        <aside className="flex flex-col gap-6" aria-label="Actions and history">
          <Card>
            <CardHeader icon={<Repeat strokeWidth={1.5} />} title="Linked actions" description={s ? `${day(s.window.from)}–${day(s.window.to)}` : undefined} />
            <ul className="flex flex-col gap-4">
              {(s?.actions ?? []).map((a) => (
                <li key={`${a.kind}:${a.id}`}>
                  <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                    <span className={a.available ? 'min-w-0 truncate font-medium text-ink' : 'min-w-0 truncate text-ink-3'}>{a.name}</span>
                    <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">{!a.available ? 'Action no longer available' : a.kind === 'schedule' ? (a.due ? `${a.done} of ${a.due} days` : 'Nothing due') : `recorded ${a.recordedDays ?? 0} of ${a.windowDays} days`}</span>
                  </div>
                  {a.available && a.kind === 'schedule' && a.due ? <Capsule size="sm" className="mt-1.5" value={a.done ?? 0} max={a.due} color={color} label={`${a.name} adherence`} /> : null}
                  {a.available && a.kind === 'tracker' ? <p className="mt-1 text-[12px] text-ink-3">Days without a record aren’t counted as misses.</p> : null}
                </li>
              ))}
            </ul>
          </Card>
          <GoalHistory unit={g.unit} startedOn={g.startedOn} baseline={`Baseline ${value(g.baselineValue, g.unit)}, ${g.baselineHow}`} rows={data.history} />
        </aside>
      </div>
    </div>
  )
}
