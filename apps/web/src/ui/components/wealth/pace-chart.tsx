import { niceAxis } from '@/domain/series'

// The month's pace as the one lead chart of Wealth Overview: what has been spent so far, day by day (a solid line), where
// that is heading at the same daily pace (a dotted tail) and where a usual month would be on each day (a dashed line).
// Drawn as plain SVG and HTML, so it renders on the server: the lines are stretched to the box (`non-scaling-stroke`
// keeps them 2px) and every dot and word is positioned in percent over it.

const ACCENT = 'var(--cat-wealth)'
const tick = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
/** Two end labels closer than this (px) are pushed apart so they do not overprint. */
const LABEL_GAP = 40
const PLOT_H = 200

export function PaceChart({ daily, daysInMonth, usual, projected, money, monthShort, label }: {
  /** Spending on each day so far, day 1 first. */
  daily: number[]
  daysInMonth: number
  /** A usual month's total; null while there is not enough history to say. */
  usual: number | null
  /** Where the month lands at this pace. */
  projected: number
  money: (v: number) => string
  /** "Nov", for the first tick. */
  monthShort: string
  label: string
}) {
  const day = daily.length
  const total = daily.reduce((a, b) => a + b, 0)
  if (!total && !usual) {
    return <figure aria-label={`${label}: nothing yet`} className="m-0 grid h-48 place-items-center rounded-md bg-surface-2"><figcaption className="text-small text-ink-3">Nothing spent yet this month</figcaption></figure>
  }
  let run = 0
  const cum = daily.map((v) => (run += v))
  const top = niceAxis(0, Math.max(total, projected, usual ?? 0), 5)
  const yMax = top.domain[1] || 1
  const x = (d: number) => (daysInMonth > 1 ? ((d - 1) / (daysInMonth - 1)) * 100 : 0)
  const y = (v: number) => 100 - (v / yMax) * 100
  const line = (pts: [number, number][]) => pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(2)} ${y(v).toFixed(2)}`).join('')
  const spentLine = line(cum.map((v, i) => [i + 1, v]))
  const tail = day < daysInMonth ? line([[day, total], [daysInMonth, projected]]) : ''
  const usualLine = usual ? line([[1, usual / daysInMonth], [daysInMonth, usual]]) : ''

  // The two end labels, at the height of their line's end; the lower one moves down when they would touch.
  const ends = [
    { key: 'pace', at: (y(projected) / 100) * PLOT_H, text: <><b className="font-medium text-ink">{money(projected)}</b> at this pace</>, ink: 'text-ink-2' },
    ...(usual ? [{ key: 'usual', at: (y(usual) / 100) * PLOT_H, text: <>Usual month <b className="font-medium">{money(usual)}</b></>, ink: 'text-ink-3' }] : []),
  ].sort((a, b) => a.at - b.at)
  for (let i = 1; i < ends.length; i++) ends[i].at = Math.max(ends[i].at, ends[i - 1].at + LABEL_GAP)
  const xTicks = [1, 8, 15, 22, daysInMonth].filter((d, i, all) => all.indexOf(d) === i && (d === 1 || d === daysInMonth || Math.abs(d - day) > 2))

  return (
    <figure aria-label={label} role="img" className="m-0">
      <div aria-hidden className="relative ps-10 pe-28 pt-5 pb-7">
        <div className="relative" style={{ height: PLOT_H }}>
          {top.ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-divider" style={{ top: `${y(t)}%` }}>
              <span className="absolute -start-10 w-8 -translate-y-1/2 text-end text-caption text-ink-3 tabular-nums">{t ? tick(t) : '0'}</span>
            </div>
          ))}
          <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            {usualLine ? <path d={usualLine} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
            {tail ? <path d={tail} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeDasharray="0.1 5" vectorEffect="non-scaling-stroke" /> : null}
            <path d={spentLine} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {/* Today: the dot where the solid line ends, named above it. */}
          <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface" style={{ left: `${x(day)}%`, top: `${y(total)}%`, background: ACCENT }} />
          <span className="absolute -translate-x-1/2 -translate-y-full pb-2 text-caption text-ink-2" style={{ left: `${x(day)}%`, top: `${y(total)}%` }}>Today</span>
          {ends.map((e) => (
            <span key={e.key} className={`absolute start-full ms-3 -mt-2 w-24 text-caption leading-4 ${e.ink}`} style={{ top: e.at }}>{e.text}</span>
          ))}
          {xTicks.map((d) => (
            <span key={d} className="absolute top-full mt-2 -translate-x-1/2 text-caption whitespace-nowrap text-ink-3 tabular-nums" style={{ left: `${x(d)}%` }}>{d === 1 ? `1 ${monthShort}` : d}</span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  )
}
