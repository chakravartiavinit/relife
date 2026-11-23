import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import type { Patterns } from '@/core/patterns'
import { formatValue, tone } from '@/domain/patterns'
import { Card } from '../card'
import { AskWhy } from '../patterns-card'

const TONE = { good: 'var(--good)', bad: 'var(--bad)', neutral: 'var(--ink-3)' }
const SHOWN = 3

/** The rail's Patterns this week: the three biggest changes, each with Ask why, and a link to every pattern. Statistics only. */
export function PatternsWeek({ patterns: p }: { patterns: Patterns }) {
  const top = p.changes.slice(0, SHOWN)
  const links = top.length ? [] : p.links.slice(0, SHOWN)
  return (
    <Card as="section" aria-labelledby="patterns-week" className="flex flex-col">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="patterns-week" className="text-heading text-ink">Patterns this week {p.changes.length ? <span className="ml-1 font-normal text-ink-3 tabular-nums">{p.changes.length}</span> : null}</h2>
          <p className="mt-0.5 text-small text-ink-3">{p.signals ? `From ${p.signals} daily numbers. Patterns, not proof.` : 'Patterns appear once two or more things have about two weeks of data.'}</p>
        </div>
        <Link href="/coach/patterns" className="-my-1 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-sm px-1.5 text-small font-medium text-ink-2 transition-colors duration-150 hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
          All<ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
        </Link>
      </header>
      {top.length ? (
        <ul className="mt-3 divide-y divide-divider">
          {top.map((c) => {
            const t = tone(c.signal, c.pct)
            const Icon = c.pct > 0 ? ArrowUpRight : ArrowDownRight
            return (
              <li key={c.signal.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} style={{ color: TONE[t] }} aria-label={t === 'neutral' ? undefined : t === 'good' ? 'Good' : 'Worth a look'} />
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{c.signal.name} {c.pct > 0 ? 'up' : 'down'} {Math.round(Math.abs(c.pct) * 100)}% this week</p>
                  <p className="text-small text-ink-3 tabular-nums">{formatValue(c.recent, c.signal.unit)} a day vs your usual {formatValue(c.usual, c.signal.unit)}</p>
                </div>
                <AskWhy about={c.text} />
              </li>
            )
          })}
        </ul>
      ) : links.length ? (
        <ul className="mt-3 divide-y divide-divider">
          {links.map((l) => (
            <li key={`${l.a.id}|${l.b.id}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <p className="min-w-0 flex-1 text-small text-ink-2 tabular-nums">{l.text}</p>
              <AskWhy about={l.text} />
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-small text-ink-3">Nothing stands out yet. Keep logging; links show up once the same thing happens on enough days.</p>}
    </Card>
  )
}
