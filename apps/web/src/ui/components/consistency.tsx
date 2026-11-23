import { CATEGORIES, type Category } from '@/domain/categories'
import type { User } from '@/core/user'
import { addDays, formatDay, localDate } from '@/core/time'
import { loadAdherence } from '@/core/adherence'
import { CATEGORY } from '../tokens'
import { Picture } from './picture'

const DAYS = 14 // phones show only the last 7 in the by-area table

type Cells = { d: string; due: number; done: number }[]
export type ConsistencyData = { today: string; days: string[]; grid: { c: Category; cells: Cells }[] }

/** Share of scheduled routines done per area per day, last two weeks. Areas with nothing due in the window are left out. */
export async function loadConsistency(user: User, now: Date): Promise<ConsistencyData> {
  const today = localDate(now, user.timezone)
  const rows = await loadAdherence(user, { kinds: ['routine', 'medicine'] }, 60, DAYS, now)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)))
  const grid = CATEGORIES.map((c) => {
    const mine = rows.filter((r) => r.schedule.category === c)
    return {
      c,
      cells: days.map((d) => {
        let due = 0, done = 0
        for (const r of mine) {
          const s = r.days.find((x) => x.date === d)?.status
          if (s === 'done') { due++; done++ } else if (s === 'partial' || s === 'missed') due++
        }
        return { d, due, done }
      }),
    }
  }).filter((r) => r.cells.some((x) => x.due))
  return { today, days, grid }
}

const pct = (cells: { due: number; done: number }[]) => {
  const due = cells.reduce((n, x) => n + x.due, 0)
  return due ? Math.round((cells.reduce((n, x) => n + x.done, 0) / due) * 100) : null
}

/** The fold's line: the three areas that did best. */
export const consistencySummary = ({ grid }: ConsistencyData) =>
  grid.map((r) => ({ c: r.c, p: pct(r.cells) })).filter((r) => r.p != null).sort((a, b) => b.p! - a.p!).slice(0, 3).map((r) => `${CATEGORY[r.c].label} ${r.p}%`).join(' · ') || 'Add a routine in Plan'

/** The by-area table (one row per area, a cell per day), behind Progress's "By area" link. */
export function ConsistencyByArea({ data: { today, days, grid } }: { data: ConsistencyData }) {
  return grid.length ? (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed sm:min-w-[560px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-24 sm:w-32" />
            {days.map((d, i) => (
              <th key={d} scope="col" className={`text-center text-caption font-medium ${d === today ? 'text-ink' : 'text-ink-3'} ${i < DAYS - 7 ? 'max-sm:hidden' : ''}`}>
                {new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))}
              </th>
            ))}
            <th className="w-14" />
          </tr>
        </thead>
        <tbody>
          {grid.map(({ c, cells }) => {
            const p = pct(cells)
            return (
              <tr key={c}>
                <th scope="row" className="pr-3 text-left text-small font-medium text-ink-2">
                  <span className="flex items-center gap-2"><Picture of="area" to={c} size={20} />{CATEGORY[c].label}</span>
                </th>
                {cells.map((x, i) => <Cell key={x.d} c={c} col={i} {...x} />)}
                <td className="pl-2 text-right text-caption text-ink-3 tabular-nums">{p == null ? '–' : `${p}%`}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3" aria-label="How to read the cells">
        {[['Some', 30], ['Most', 50], ['All', 70]].map(([l, n]) => <span key={l} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-xs" style={{ background: `color-mix(in oklch, var(--ink-2) ${n}%, transparent)` }} />{l}</span>)}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-xs shadow-[inset_0_0_0_1px_var(--hairline)]" />Nothing due</span>
      </p>
    </div>
  ) : (
    <p className="text-small text-ink-3">Add a routine in Plan and its days fill in here.</p>
  )
}

function Cell({ c, d, due, done, col }: { c: Category; d: string; due: number; done: number; col: number }) {
  const share = due ? done / due : 0
  const label = `${formatDay(d)}: ${due ? `${done} of ${due} done` : 'nothing scheduled'}`
  return (
    <td className={col < DAYS - 7 ? 'p-0 max-sm:hidden' : 'p-0'}>
      <div
        role="img"
        aria-label={label}
        title={label}
        className="reveal-cell h-7 rounded-[6px]"
        style={{
          '--col': col,
          ...(due
            ? { background: share ? `color-mix(in oklch, ${CATEGORY[c].color} ${Math.round(18 + share * 52)}%, transparent)` : 'var(--surface-2)', boxShadow: share ? undefined : 'inset 0 0 0 1px var(--hairline)' }
            : { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--hairline)' }),
        } as React.CSSProperties}
      />
    </td>
  )
}

