import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'
import { CATEGORIES, type Category } from '@/db/schema'
import type { User } from '@/core/user'
import { addDays, formatDay, localDate } from '@/core/time'
import { loadAdherence } from '@/core/adherence'
import { CATEGORY } from '../tokens'
import { Card, CardHeader } from './card'
import { buttonClass } from './button'

const DAYS = 14 // phones show only the last 7

/** Share of scheduled routines done per area per day, last two weeks. */
export async function Consistency({ user, now }: { user: User; now: Date }) {
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

  return (
    <Card>
      <CardHeader title="Consistency" icon={<CalendarCheck strokeWidth={2} />} color="var(--pill)" description="Routines done each day, by area" action={<Link href="/routines" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Routines</Link>} />
      {grid.length ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed sm:min-w-[560px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-20 sm:w-32" />
                {days.map((d, i) => (
                  <th key={d} scope="col" className={`text-center text-[11px] font-medium ${d === today ? 'text-ink' : 'text-ink-3'} ${i < DAYS - 7 ? 'max-sm:hidden' : ''}`}>
                    {new Intl.DateTimeFormat('en', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))}
                  </th>
                ))}
                <th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {grid.map(({ c, cells }) => {
                const due = cells.reduce((s, x) => s + x.due, 0)
                const done = cells.reduce((s, x) => s + x.done, 0)
                return (
                  <tr key={c}>
                    <th scope="row" className="pr-3 text-left text-[13px] font-medium text-ink-2">
                      <span className="flex items-center gap-2"><span aria-hidden className="size-2 rounded-full" style={{ background: CATEGORY[c].color }} />{CATEGORY[c].label}</span>
                    </th>
                    {cells.map((x, i) => <Cell key={x.d} c={c} col={i} {...x} />)}
                    <td className="pl-2 text-right text-[12px] text-ink-3 tabular-nums">{due ? `${Math.round((done / due) * 100)}%` : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">Add a routine on Habits and its days fill in here.</p>
      )}
    </Card>
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

