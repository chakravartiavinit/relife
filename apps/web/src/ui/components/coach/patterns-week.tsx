import Link from 'next/link'
import type { Patterns } from '@/core/patterns'
import { buttonLinkClass } from '../button'
import { Card } from '../card'
import { Connection } from '../connection'
import { AskWhyLink } from './ask-why'
import { pairPictures } from './signal-picture'

const SHOWN = 2

/**
 * The rail's Patterns this week: up to two connections, this week's changes first and then what moves together, each
 * with both signals' pictures and Ask why, and a link to every pattern. Statistics only; nothing shows unless
 * `findChanges` / `findLinks` found it.
 */
export function PatternsWeek({ patterns: p, today }: { patterns: Patterns; today: string }) {
  const total = p.changes.length + p.links.length
  const shown = [
    ...p.changes.map((c) => ({ key: c.signal.id, text: c.text, pictures: pairPictures([c.signal, ...c.with.slice(0, 1).map((w) => w.signal)]), props: { change: c } })),
    ...p.links.map((l) => ({ key: `${l.a.id}|${l.b.id}`, text: l.text, pictures: pairPictures([l.a, l.b]), props: { link: l } })),
  ].slice(0, SHOWN)
  return (
    <Card as="section" aria-labelledby="patterns-week" className="flex flex-col">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="patterns-week" className="font-display text-heading text-ink">Patterns this week {total ? <span className="ml-1 font-sans text-small font-normal text-ink-3 tabular-nums">{total}</span> : null}</h2>
          <p className="mt-0.5 text-small text-ink-3">{p.signals ? `From ${p.signals} daily numbers. Patterns, not proof.` : 'Patterns appear once two or more things have about two weeks of data.'}</p>
        </div>
        <Link href="/coach/patterns" className={buttonLinkClass('inline-flex min-h-8 shrink-0 items-center text-small')}>All{total ? ` ${total}` : ''}</Link>
      </header>
      {shown.length ? (
        <ul className="mt-4 divide-y divide-divider">
          {shown.map((s, n) => (
            <li key={s.key} className="py-4 first:pt-0 last:pb-0">
              <Connection {...s.props} pictures={s.pictures} today={today} spark={n === 0 && 'change' in s.props} trailing={<AskWhyLink about={s.text} />} />
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-small text-ink-3">Nothing stands out yet. Keep logging; links show up once the same thing happens on enough days.</p>}
    </Card>
  )
}
