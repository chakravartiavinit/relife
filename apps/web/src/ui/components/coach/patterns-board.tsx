import type { Patterns } from '@/core/patterns'
import { Card, SectionLabel } from '../card'
import { Connection } from '../connection'
import { EmptyState } from '../empty'
import { AskWhyLink } from './ask-why'
import { pairPictures } from './signal-picture'

/** Coach › Patterns: what changed this week and what moves together, every one a Connection with both signals' pictures. */
export function PatternsBoard({ patterns: p, today }: { patterns: Patterns; today: string }) {
  if (!p.links.length && !p.changes.length) {
    return (
      <Card as="section" aria-label="Patterns">
        <EmptyState
          title="Nothing stands out yet" picture={{ of: 'nav', to: '/coach' }}
          description={p.signals < 2
            ? 'Patterns appear once two or more things have about two weeks of data, like mood and sleep, or spending and routines.'
            : 'Keep logging; links show up once the same thing happens on enough days.'}
        />
      </Card>
    )
  }
  return (
    <Card as="section" aria-labelledby="patterns-h" className="flex flex-col gap-6">
      <div>
        <h2 id="patterns-h" className="font-display text-heading text-ink">Patterns across your life</h2>
        <p className="mt-0.5 text-small text-ink-3">From {p.signals} daily numbers over the last 90 days. Patterns, not proof.</p>
      </div>
      {p.changes.length ? (
        <section aria-labelledby="changes-h">
          <SectionLabel id="changes-h" as="h3" rule className="mb-4">This week</SectionLabel>
          <ul className="divide-y divide-divider">
            {p.changes.map((c, n) => (
              <li key={c.signal.id} className="py-4 first:pt-0 last:pb-0">
                <Connection change={c} today={today} spark={n < 3} pictures={pairPictures([c.signal, ...c.with.slice(0, 1).map((w) => w.signal)])} trailing={<AskWhyLink about={c.text} />} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {p.links.length ? (
        <section aria-labelledby="links-h">
          <SectionLabel id="links-h" as="h3" rule className="mb-4">What moves together</SectionLabel>
          <ul className="divide-y divide-divider">
            {p.links.map((l) => (
              <li key={`${l.a.id}|${l.b.id}`} className="py-4 first:pt-0 last:pb-0">
                <Connection link={l} today={today} pictures={pairPictures([l.a, l.b])} trailing={<AskWhyLink about={l.text} />} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  )
}
