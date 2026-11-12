'use client'

import { useId, useState, useTransition } from 'react'
import { Check, ChartLine, History, Pencil, PencilLine, Target, X } from 'lucide-react'
import { setTrackerTarget } from '@/app/actions'
import type { MetricPeek } from '@/core/peek/types'
import { formatDay } from '@/core/time'
import { amountText } from '@/domain/capture'
import { CATEGORY } from '@/ui/tokens'
import { Badge, Card, CardHeader } from '../../card'
import { Button } from '../../button'
import { Capsule } from '../../capsule'
import { AREA_ICON } from '../../capsule-icon'
import { DailyBars, TrendArea } from '../../charts'
import { Input, Segmented } from '../../form'
import { QuickLog } from '../../forms/tracker-forms'
import { useToast } from '../../toast'
import { usePeekChanged } from '../peek-context'
import { PeekFooter, PeekIcon, PeekOpen, PeekSection, PeekStats } from '../peek-parts'

const RANGES = [{ value: '7', label: '7D' }, { value: '28', label: '28D' }, { value: '90', label: '90D' }]

export const metricValue = (t: Pick<MetricPeek, 'unit'>, v: number | null) => (v == null ? '–' : amountText(v, t.unit))

export function MetricPeekView({ data }: { data: MetricPeek }) {
  return (
    <>
      <MetricDetail data={data} />
      <PeekFooter><PeekOpen href={`/plan/trackers/${encodeURIComponent(data.slug)}`}>Open full page</PeekOpen></PeekFooter>
    </>
  )
}

export function metricHeading(d: MetricPeek) {
  const c = CATEGORY[d.category]
  return {
    title: d.name,
    description: `${c.label} · tracker${d.target ? ` · daily target ${metricValue(d, d.target)}` : ''}`,
    icon: <PeekIcon icon={AREA_ICON[d.category]} color={c.color} />,
  }
}

/**
 * One tracker's numbers: today against its target, the trend, averages, target editor, log box, sources and recent
 * entries. The Peek shows it as a column; `wide` lays it out as cards for /plan/trackers/[slug], which loads the same
 * payload on the server, so the two cannot drift.
 */
export function MetricDetail({ data: t, wide = false }: { data: MetricPeek; wide?: boolean }) {
  const [range, setRange] = useState('28')
  const color = CATEGORY[t.category].color
  const n = Number(range)
  const shown = t.series.slice(-(wide ? 90 : n))
  const height = wide ? 260 : 170
  const label = `${t.name}, last ${wide ? 90 : n} days`
  const chart = t.aggregate === 'last' || t.kind === 'scale'
    ? <TrendArea data={shown} color={color} unit={t.unit ?? undefined} target={t.target} height={height} label={label} domain={t.kind === 'scale' ? [1, 5] : undefined} />
    : <DailyBars data={shown} color={color} unit={t.unit ?? undefined} target={t.target} height={height} label={label} />
  const rangeControl = wide ? null : <Segmented name="range" aria-label="Range" options={RANGES} value={range} onValueChange={setRange} />

  const today = <TodayValue t={t} />
  const stats = (
    <>
      <PeekStats items={[{ label: '7-day avg', value: metricValue(t, t.avg.d7) }, { label: '28-day avg', value: metricValue(t, t.avg.d28) }, { label: '90-day avg', value: metricValue(t, t.avg.d90) }]} />
      <p className="mt-2 text-caption text-ink-3 tabular-nums">
        {t.onTarget ? `On target ${t.onTarget.hit} of the last ${t.onTarget.days} days · ` : ''}streak {t.streak.current} {t.streak.current === 1 ? 'day' : 'days'} · best {t.streak.best}
      </p>
    </>
  )
  const log = <QuickLog slug={t.slug} name={t.name} unit={t.unit} step={t.kind === 'scale' ? '1' : undefined} />
  const targetRow = t.kind === 'bool' ? null : <TargetRow t={t} />
  const sources = t.sources.length ? (
    <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
      {t.sources.map((s) => (
        <li key={s.source}><Badge color={s.verified ? 'var(--pill)' : undefined}>{s.verified ? s.source : `${s.source} · typed in`}</Badge></li>
      ))}
    </ul>
  ) : null
  const entries = <Entries t={t} />

  if (wide) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <CardHeader title="Last 90 days" icon={<ChartLine strokeWidth={2} />} color="var(--pill)" description={t.aggregate === 'last' ? 'Daily value' : 'Daily total'} />
            {chart}
          </Card>
          <div className="flex flex-col gap-6">
            <Card>{today}</Card>
            <Card>{stats}</Card>
            <Card>
              <CardHeader title="Log today" icon={<PencilLine strokeWidth={2} />} color="var(--pill)" />
              {log}
            </Card>
            {targetRow ? <Card><CardHeader title="Target" icon={<Target strokeWidth={2} />} color="var(--pill)" />{targetRow}</Card> : null}
          </div>
        </div>
        {sources ? <Card><CardHeader title="Sources" description="Where the recent numbers came from" />{sources}</Card> : null}
        <Card>
          <CardHeader title="Recent entries" icon={<History strokeWidth={2} />} color="var(--pill)" />
          {entries}
        </Card>
      </div>
    )
  }
  return (
    <div>
      {today}
      <div className="mt-4">{log}</div>
      <PeekSection label="Trend" aside={rangeControl}>
        {chart}
      </PeekSection>
      <div className="mt-4">{stats}</div>
      {targetRow ? <PeekSection label="Target">{targetRow}</PeekSection> : null}
      {sources ? <PeekSection label="Sources">{sources}</PeekSection> : null}
      <PeekSection label="Recent entries" aside={t.entries.length ? `${t.entries.length} shown` : undefined}>{entries}</PeekSection>
    </div>
  )
}

/** Today's number big, then how it stands against the target. */
function TodayValue({ t }: { t: MetricPeek }) {
  const v = t.todayValue
  let line: React.ReactNode = v == null ? 'Nothing logged today' : null
  let tone = 'text-ink-3'
  if (v != null && t.target) {
    const met = t.direction === 'down' ? v <= t.target : v >= t.target
    const gap = Math.abs(t.target - v)
    line = met ? (t.direction === 'down' ? 'Under target' : 'Target reached') : t.direction === 'down' ? `${metricValue(t, gap)} over` : `${metricValue(t, gap)} to go`
    tone = met ? 'text-good' : 'text-warn'
  }
  return (
    <div>
      <p className="text-caption text-ink-3">Today</p>
      <p className="num mt-0.5 flex flex-wrap items-baseline gap-x-2 text-display text-ink tabular-nums">
        {v == null ? '–' : metricValue(t, v)}
        {t.target ? <span className="text-heading font-semibold text-ink-3">of {metricValue(t, t.target)}</span> : null}
      </p>
      {v != null && t.target && t.direction === 'up' ? <Capsule className="mt-3" value={v} max={t.target} color={CATEGORY[t.category].color} label={`${t.name} today`} /> : null}
      {line ? <p className={`mt-2 text-small ${tone}`}>{line}</p> : null}
    </div>
  )
}

/** The daily target and an inline editor. Empty clears it. */
function TargetRow({ t }: { t: MetricPeek }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const toast = useToast()
  const changed = usePeekChanged()
  const id = useId()
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const raw = value.trim()
    const n = raw === '' ? null : Number(raw)
    if (n !== null && (!Number.isFinite(n) || n <= 0)) { setError('Enter a number above 0, or leave it empty to remove the target.'); return }
    setError(null)
    start(async () => {
      try {
        await setTrackerTarget(t.slug, n)
        toast(n == null ? `${t.name} target removed` : `${t.name} target set to ${metricValue(t, n)}`, 'good')
        setEditing(false)
        changed()
      } catch { toast.error() }
    })
  }
  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-2 tabular-nums">
          {t.target ? <>{metricValue(t, t.target)} a day <span className="text-ink-3">· {t.direction === 'down' ? 'lower is better' : 'higher is better'}</span></> : <span className="text-ink-3">No target yet</span>}
        </p>
        <Button size="sm" onClick={() => { setValue(t.target != null ? String(t.target) : ''); setEditing(true) }}>
          <Pencil className="size-3.5" strokeWidth={1.5} aria-hidden />{t.target ? 'Edit' : 'Set a target'}
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">Daily target{t.unit ? ` in ${t.unit}` : ''}</label>
      <div className="flex items-center gap-1.5">
        <Input id={id} data-autofocus type="number" inputMode="decimal" step="any" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t.unit ? `Daily target, ${t.unit}` : 'Daily target'} aria-invalid={!!error || undefined} className="h-10" />
        <Button type="submit" variant="primary" size="icon" className="size-10" disabled={pending} aria-label="Save target"><Check className="size-4" strokeWidth={2} /></Button>
        <Button size="icon" className="size-10" disabled={pending} aria-label="Cancel" onClick={() => { setEditing(false); setError(null) }}><X className="size-4" strokeWidth={1.5} /></Button>
      </div>
      {error ? <p role="alert" className="text-caption text-bad">{error}</p> : <p className="text-caption text-ink-3">Leave it empty to remove the target.</p>}
    </form>
  )
}

/** Recent entries: date, value, note and source. */
function Entries({ t }: { t: MetricPeek }) {
  if (!t.entries.length) return <p className="text-small text-ink-3">No entries yet. Log one above and it shows here.</p>
  return (
    <ul className="-my-2 divide-y divide-divider">
      {t.entries.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2.5 text-small">
          <span className="w-24 shrink-0 text-ink-3 tabular-nums">{formatDay(e.date)}</span>
          <span className="flex-1 truncate font-medium text-ink tabular-nums">{metricValue(t, e.value)}{e.note ? <span className="ml-2 font-normal text-ink-3">{e.note}</span> : null}</span>
          <Badge color={e.verified ? 'var(--pill)' : undefined}>{e.source}</Badge>
        </li>
      ))}
    </ul>
  )
}
