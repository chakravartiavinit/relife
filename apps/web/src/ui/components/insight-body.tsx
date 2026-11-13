import Link from 'next/link'
import { ArrowDown, ArrowUp, Check, Eye, Target } from 'lucide-react'
import type { ReviewContent, ReviewPoint } from '@/db/schema'
import { hideUrlQuery } from '@/domain/text'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'
import { buttonClass } from './button'

// How an insight's text is shown in the app. Weekly reviews come in parts (wins, watch, next week) and get a real
// layout; alerts get their numbers in a table; anything older or plain is lightly formatted: "**Wins**" headings,
// "- " bullets and **bold** spans.

const SECTION = {
  wins: { label: 'Wins', icon: Check, color: 'var(--good)' },
  watch: { label: 'Watch', icon: Eye, color: 'var(--warn)' },
} as const

export function InsightBody({ body, review, kind }: { body: string; review?: ReviewContent; kind?: string }) {
  if (review) return <Review r={review} />
  if (kind === 'alert') return <AlertBody text={body} />
  return <Formatted text={body} />
}

/**
 * An alert is stored as one line of what happened, then its exact numbers one per line (src/rules/run.ts), like
 * "Yesterday ₹0 · ▼ 100%". The numbers go in an inset table with the change as a pill on the right.
 */
function AlertBody({ text }: { text: string }) {
  const [lead, ...data] = hideUrlQuery(text).split('\n').filter((l) => l.trim())
  return (
    <div className="flex max-w-[68ch] flex-col gap-3">
      <p className="text-[14px] leading-relaxed text-ink-2 text-pretty [overflow-wrap:anywhere]">{lead}</p>
      {data.length ? (
        <ul aria-label="Numbers" className="divide-y divide-divider rounded-[12px] bg-surface-2 px-3.5">
          {data.map((line, i) => {
            const m = /^(.*?)\s*·\s*([▲▼])\s*([\d.,]+%)$/.exec(line)
            return (
              <li key={i} className="flex min-h-10 items-center justify-between gap-3 py-2 text-[13px] text-ink-2 tabular-nums">
                <span className="min-w-0 [overflow-wrap:anywhere]"><Amounts text={m ? m[1] : line} /></span>
                {m ? <Change up={m[2] === '▲'} pct={m[3]} /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/** Money and percentages in ink, the words around them in the muted body colour. */
function Amounts({ text }: { text: string }) {
  return <>{text.split(/([-−]?[₹$€£]\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%)/).map((part, i) => (i % 2 ? <span key={i} className="font-medium text-ink">{part}</span> : part))}</>
}

function Change({ up, pct }: { up: boolean; pct: string }) {
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface px-2 text-[12px] font-medium text-ink-2 shadow-1">
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{up ? 'Up' : 'Down'} </span>{pct}
    </span>
  )
}

function Review({ r }: { r: ReviewContent }) {
  return (
    <div className="flex flex-col gap-4">
      <div className={cn('grid gap-4', r.wins.length > 0 && r.watch.length > 0 && 'md:grid-cols-2')}>
        {r.wins.length ? <Points kind="wins" points={r.wins} /> : null}
        {r.watch.length ? <Points kind="watch" points={r.watch} /> : null}
      </div>
      {r.focus || r.plan ? <NextWeek focus={r.focus} plan={r.plan} /> : null}
      {r.goals?.length ? <GoalPoints goals={r.goals} /> : null}
    </div>
  )
}

/** Outcome goals in a review: the rule-based lines, the question, and a link to decide on /goals. */
function GoalPoints({ goals }: { goals: NonNullable<ReviewContent['goals']> }) {
  return (
    <section aria-label="Goals">
      <SectionLabel icon={Target} color="var(--pill-ink)">Goals</SectionLabel>
      <ul className="flex flex-col gap-3">
        {goals.map((g) => (
          <li key={g.reviewId} className="min-w-0">
            <p className="text-[14px] leading-snug font-medium text-ink">{g.title}</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-[13px] leading-relaxed text-ink-3 tabular-nums">
              {g.lines.map((l, i) => <li key={i} className="text-pretty">{l}</li>)}
            </ul>
            {g.note ? <p className="mt-1 text-[13px] leading-relaxed text-ink-2 text-pretty"><span className="font-medium text-ink">Coach note: </span>{g.note}</p> : null}
            <p className="mt-1 text-[13.5px] font-medium text-ink-2 text-pretty">{g.prompt}</p>
          </li>
        ))}
      </ul>
      <Link href="/plan/review" className={cn(buttonClass({ variant: 'secondary', size: 'md' }), 'mt-3')}>Decide on Goals</Link>
    </section>
  )
}

function Points({ kind, points }: { kind: keyof typeof SECTION; points: ReviewPoint[] }) {
  const s = SECTION[kind]
  return (
    <section aria-label={s.label}>
      <SectionLabel icon={s.icon} color={s.color}>{s.label}</SectionLabel>
      <ul className="flex flex-col gap-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: CATEGORY[p.area]?.color ?? 'var(--ink-3)' }} />
            <span className="min-w-0">
              <span className="block text-[14px] leading-snug font-medium text-ink">{p.headline}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-3 text-pretty">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextWeek({ focus, plan }: { focus: string; plan: string }) {
  return (
    <section aria-label="Next week" className="flex gap-3 rounded-[14px] bg-pill-wash px-4 py-3">
      <Target className="mt-0.5 size-[18px] shrink-0 text-pill-ink" strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold tracking-[0.04em] text-pill-ink uppercase">Next week</p>
        {focus ? <p className="mt-0.5 text-[14.5px] font-semibold text-ink">{focus}</p> : null}
        {plan ? <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2 text-pretty">{plan}</p> : null}
      </div>
    </section>
  )
}

function SectionLabel({ icon: Icon, color, children }: { icon: typeof Check; color: string; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
      <span aria-hidden className="grid size-5 place-items-center rounded-full" style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)` }}>
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      {children}
    </p>
  )
}

/** "**Wins**" / "Wins:" headings, "- " bullets and **bold** spans, for reviews saved before they came in parts. */
function Formatted({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  // An old review's "Next week" block becomes the same callout as a new one.
  const heading = (line: string) => /^\*\*(.+)\*\*:?$/.exec(line.trim())?.[1] ?? /^([A-Z][\w ]{1,20}):$/.exec(line.trim())?.[1]
  return (
    <div className="flex max-w-[68ch] flex-col gap-3 text-[14px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]">
      {blocks.map((block, n) => {
        const lines = block.split('\n')
        const title = heading(lines[0])
        const rest = title ? lines.slice(1) : lines
        if (title && /next week/i.test(title)) return <NextWeek key={n} focus="" plan={rest.join(' ').replace(/^- /, '')} />
        const bullets = rest.every((l) => /^\s*[-•]\s/.test(l))
        const kind = title && /win/i.test(title) ? 'wins' : title && /watch|slip|problem/i.test(title) ? 'watch' : null
        return (
          <section key={n}>
            {title ? (kind ? <SectionLabel icon={SECTION[kind].icon} color={SECTION[kind].color}>{title}</SectionLabel> : <p className="mb-1 text-[12px] font-semibold text-ink-2">{title}</p>) : null}
            {bullets && rest.length ? (
              <ul className="flex flex-col gap-1.5">
                {rest.map((l, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-ink-3" />
                    <span className="text-pretty"><Inline text={l.replace(/^\s*[-•]\s/, '')} /></span>
                  </li>
                ))}
              </ul>
            ) : <p className="whitespace-pre-wrap text-pretty"><Inline text={rest.join('\n')} /></p>}
          </section>
        )
      })}
    </div>
  )
}

/** **bold** spans; everything else as typed. */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : part))}</>
}
