import { niceAxis } from '@/domain/series'

// One bar per day of the month, as the lead chart of Wealth › Spending. A day far above the rest (the rent) would flatten
// every other bar, so the axis stops above the next biggest day: that bar is cut with a notch and its amount written beside
// it. Days still to come are a dash. Plain HTML, so it renders on the server; a bar's tooltip is its day and amount.

const ACCENT = 'var(--cat-wealth)'
const tick = (v: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
const PLOT_H = 168
/** A day this many times the next biggest is cut. */
const CUT_AT = 1.8

export type Day = { date: string; day: number; value: number | null; label: string }

/** The axis top, and the index of the day it cuts (none when no day stands out). */
export function barScale(values: (number | null)[]) {
  const ranked = values.map((v, i) => [v ?? 0, i] as const).sort((a, b) => b[0] - a[0])
  const [big, next] = [ranked[0]?.[0] ?? 0, ranked[1]?.[0] ?? 0]
  const cut = next > 0 && big > next * CUT_AT
  const axis = niceAxis(0, cut ? next * 1.1 : big, 3)
  return { max: axis.domain[1] || 1, ticks: axis.ticks, cut: cut ? ranked[0][1] : -1 }
}

export function DayBars({ days, money, monthShort, todayDay, label, cutNote }: {
  days: Day[]
  money: (v: number) => string
  monthShort: string
  /** The day number of today when the month is the current one, so it is named on the axis. */
  todayDay?: number
  label: string
  /** What the cut day was, for its label: "rent". Without it the label is the amount alone. */
  cutNote?: (d: Day) => string | null
}) {
  const { max, ticks, cut } = barScale(days.map((d) => d.value))
  const n = days.length
  const ticksX = [1, 8, 15, 22, n].filter((d, i, all) => all.indexOf(d) === i && (d === 1 || d === n || todayDay == null || Math.abs(d - todayDay) > 2))
  const at = (d: number) => `${((d - 0.5) / n) * 100}%`
  const cutDay = cut >= 0 ? days[cut] : null
  const note = cutDay ? cutNote?.(cutDay) : null
  return (
    <figure aria-label={label} role="img" className="m-0">
      <div aria-hidden className="relative ps-10 pb-7">
        <div className="relative" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-divider" style={{ bottom: `${(t / max) * 100}%` }}>
              <span className="absolute -start-10 w-8 -translate-y-1/2 text-end text-caption text-ink-3 tabular-nums">{t ? tick(t) : '0'}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5 sm:gap-[3px]">
            {days.map((d, i) => (
              <div key={d.date} title={d.value == null ? undefined : `${d.label}: ${money(d.value)}`} className="relative flex h-full flex-1 items-end">
                {d.value == null ? (
                  <span className="h-px w-full border-t border-dashed border-ink-3/50" />
                ) : d.value === 0 ? (
                  <span className="h-0.5 w-full rounded-full bg-ink/15" />
                ) : (
                  <span
                    className="relative block w-full rounded-t-xs"
                    style={{ height: `${Math.min(100, (d.value / max) * 100)}%`, minHeight: 2, background: ACCENT }}
                  >
                    {i === cut ? <span className="absolute inset-x-0 top-2 h-1 -skew-y-12 bg-surface" /> : null}
                  </span>
                )}
              </div>
            ))}
          </div>
          {cutDay ? (
            <span
              className="absolute top-0 -mt-1 text-caption whitespace-nowrap text-ink-2 tabular-nums"
              style={cut < n / 2 ? { left: `calc(${at(cutDay.day)} + 10px)` } : { right: `calc(${100 - ((cutDay.day - 0.5) / n) * 100}% + 10px)` }}
            >
              {money(cutDay.value ?? 0)}{note ? `, ${note}` : ''}
            </span>
          ) : null}
          {ticksX.map((d) => (
            <span key={d} className="absolute top-full mt-2 -translate-x-1/2 text-caption whitespace-nowrap text-ink-3 tabular-nums" style={{ left: at(d) }}>{d === 1 ? `1 ${monthShort}` : d}</span>
          ))}
          {todayDay ? <span className="absolute top-full mt-2 -translate-x-1/2 text-caption font-medium whitespace-nowrap text-ink" style={{ left: at(todayDay) }}>Today</span> : null}
        </div>
      </div>
    </figure>
  )
}
