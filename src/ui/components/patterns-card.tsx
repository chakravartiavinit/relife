import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Waypoints } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { Patterns } from '@/core/patterns'
import { tone } from '@/domain/patterns'
import { CATEGORY } from '../tokens'
import { Badge, Card, CardHeader } from './card'

const areaColor = (area: string) => CATEGORY[area as Category]?.color ?? 'var(--ink-3)'
const TONE = { good: 'var(--good)', bad: 'var(--bad)', neutral: 'var(--ink-3)' }

/** What changed this week and what moves together, across every area. Statistics only; the coach explains them. */
/** "Ask why": Coach with the question already in the composer (the same hand-off as Capture's ⌘↵). */
function AskWhy({ about }: { about: string }) {
  return (
    <Link
      href={`/coach?ask=${encodeURIComponent(`Why might this be? ${about}`)}`}
      className="inline-flex h-8 shrink-0 items-center rounded-sm px-1.5 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
    >Ask why</Link>
  )
}

export function PatternsCard({ patterns: p, title = 'Patterns across your life', askWhy = false }: { patterns: Patterns; title?: string; askWhy?: boolean }) {
  const empty = !p.links.length && !p.changes.length
  return (
    <Card>
      <CardHeader
        icon={<Waypoints className="size-4" strokeWidth={2} />}
        title={title}
        description={empty ? undefined : `From ${p.signals} daily numbers over the last 90 days. Patterns, not proof.`}
      />
      {empty ? (
        <p className="text-[13px] text-ink-3">
          {p.signals < 2
            ? 'Patterns appear once two or more things have about two weeks of data, like mood and sleep, or spending and routines.'
            : 'Nothing stands out yet. Keep logging; links show up once the same thing happens on enough days.'}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {p.changes.length ? (
            <section aria-labelledby="changes-h">
              <h3 id="changes-h" className="mb-2 text-[12.5px] font-medium text-ink-3">This week</h3>
              <ul className="flex flex-col gap-2">
                {p.changes.map((c) => {
                  const t = tone(c.signal, c.pct)
                  const Icon = c.pct > 0 ? ArrowUpRight : ArrowDownRight
                  return (
                    <li key={c.signal.id} className="flex items-start gap-3 rounded-[12px] bg-surface-2 px-3 py-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2} style={{ color: TONE[t] }} aria-label={t === 'neutral' ? undefined : t === 'good' ? 'Good' : 'Worth a look'} />
                      <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink tabular-nums">{c.text}</p>
                      {askWhy ? <AskWhy about={c.text} /> : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          {p.links.length ? (
            <section aria-labelledby="links-h">
              <h3 id="links-h" className="mb-2 text-[12.5px] font-medium text-ink-3">What moves together</h3>
              <ul className="flex flex-col divide-y divide-divider">
                {p.links.map((l) => (
                  <li key={`${l.a.id}|${l.b.id}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span aria-hidden className="mt-1 flex shrink-0 -space-x-1">
                      <span className="size-2.5 rounded-full ring-2 ring-surface" style={{ background: areaColor(l.a.area) }} />
                      <span className="size-2.5 rounded-full ring-2 ring-surface" style={{ background: areaColor(l.b.area) }} />
                    </span>
                    {/* Phones: the badge drops under the sentence, lined up with its start. */}
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:flex-row sm:gap-3">
                      <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-2 tabular-nums">{l.text}</p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge>{Math.abs(l.rho) >= 0.6 ? 'Strong' : 'Clear'} · {l.n} days</Badge>
                        {askWhy ? <AskWhy about={l.text} /> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  )
}
