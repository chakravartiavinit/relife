import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClass } from '@/ui/components/button'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, count, desc, eq, ne } from 'drizzle-orm'
import { BellDot, BellRing, CalendarRange, Cpu, History, Inbox, Lightbulb, Repeat, Target } from 'lucide-react'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { aiEnabled, modelId } from '@/ai'
import { describe } from '@/domain/recurrence'
import { sentenceCase } from '@/domain/text'
import { formatDay, localDate } from '@/core/time'
import { Badge, Card, CardHeader, IconChip, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { AskBox, InsightActions } from '@/ui/components/insight-ui'
import { InsightBody } from '@/ui/components/insight-body'
import { PatternsCard } from '@/ui/components/patterns-card'
import { loadPatterns } from '@/core/patterns'
import { CATEGORY } from '@/ui/tokens'
import { cn } from '@/ui/cn'

export const metadata: Metadata = { title: 'Insights' }

/** Each kind of insight has its own icon and colour, so a long queue scans by shape before words. */
const KIND = {
  alert: { label: 'Alert', plural: 'Alerts', icon: BellRing, color: 'var(--warn)' },
  nudge: { label: 'Nudge', plural: 'Nudges', icon: Lightbulb, color: 'var(--pill)' },
  review: { label: 'Weekly review', plural: 'Reviews', icon: CalendarRange, color: 'var(--cat-mind)' },
  plan: { label: 'Plan', plural: 'Plans', icon: Target, color: 'var(--good)' },
} as const
type Kind = keyof typeof KIND
const isKind = (v: unknown): v is Kind => typeof v === 'string' && v in KIND

const STATUS: Record<string, { label: string; color?: string }> = {
  accepted: { label: 'Accepted', color: 'var(--good)' },
  done: { label: 'Done', color: 'var(--good)' },
  dismissed: { label: 'Dismissed' },
}

export default function InsightsPage({ searchParams }: PageProps<'/insights'>) {
  return (
    <>
      <PageHeader eyebrow="Coach" title="Your coach" description="Morning nudges, Sunday reviews and plans, written by the AI model you choose. Nothing changes until you approve it." />
      <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}>
        <Insights searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Insights({ searchParams }: { searchParams: PageProps<'/insights'>['searchParams'] }) {
  await connection()
  const sp = await searchParams
  const initial = typeof sp.ask === 'string' ? sp.ask : undefined
  const show = isKind(sp.show) ? sp.show : null
  const user = await getUser()
  const mine = eq(schema.insights.userId, user.id)
  const isPending = eq(schema.insights.status, 'pending')
  const [pending, counts, history, plans, patterns] = await Promise.all([
    db.select().from(schema.insights)
      .where(and(mine, isPending, show ? eq(schema.insights.kind, show) : undefined))
      .orderBy(desc(schema.insights.createdAt)).limit(30),
    db.select({ kind: schema.insights.kind, n: count() }).from(schema.insights)
      .where(and(mine, isPending)).groupBy(schema.insights.kind),
    db.select().from(schema.insights)
      .where(and(mine, ne(schema.insights.status, 'pending')))
      .orderBy(desc(schema.insights.updatedAt)).limit(20),
    db.select().from(schema.plans)
      .where(and(eq(schema.plans.userId, user.id), eq(schema.plans.status, 'active')))
      .orderBy(desc(schema.plans.createdAt)),
    loadPatterns(user),
  ])
  const enabled = aiEnabled('chat')
  const total = counts.reduce((s, c) => s + c.n, 0)
  // Filters only for kinds that have something waiting, and only when there is more than one kind to tell apart.
  const tabs = (Object.keys(KIND) as Kind[]).flatMap((k) => {
    const n = counts.find((c) => c.kind === k)?.n ?? 0
    return n ? [{ key: k as Kind | null, label: KIND[k].plural, n }] : []
  })
  const filters = tabs.length > 1 || show ? [{ key: null, label: 'All', n: total }, ...tabs] : []

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="ask-h">
          <h2 id="ask-h" className="sr-only">Ask your data</h2>
          {enabled ? <AskBox initial={initial} enabled /> : <ConnectCoach />}
        </section>

        <PatternsCard patterns={patterns} />

        <Card className="px-0 pb-2">
          <CardHeader
            title="Waiting for you" icon={<BellDot strokeWidth={2} />} color="var(--pill)" className="px-5"
            description={total ? `${total} to review` : undefined}
          />
          {filters.length ? (
            <nav aria-label="Show" className="flex gap-1 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">
              {filters.map((t) => (
                <Link
                  key={t.key ?? 'all'} href={t.key ? `/insights?show=${t.key}` : '/insights'} scroll={false}
                  aria-current={t.key === show ? 'page' : undefined}
                  className={cn(buttonClass({ variant: t.key === show ? 'primary' : 'ghost', size: 'sm' }), 'shrink-0')}
                >
                  {t.label}
                  <span className={cn('tabular-nums', t.key === show ? 'opacity-70' : 'text-ink-3')}>{t.n}</span>
                </Link>
              ))}
            </nav>
          ) : null}
          {pending.length ? (
            <ul className="flex flex-col divide-y divide-divider border-t border-divider">
              {pending.map((i) => {
                const k = KIND[i.kind]
                const actions = i.payload.actions ?? []
                return (
                  <li key={i.id} className="flex gap-3.5 px-5 py-5">
                    <IconChip color={k.color} className="mt-px"><k.icon strokeWidth={2} /></IconChip>
                    <article className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-[18px] text-ink-3">
                        <span className="font-medium text-ink-2">{k.label}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={localDate(i.createdAt, user.timezone)}>{formatDay(localDate(i.createdAt, user.timezone))}</time>
                        {i.payload.meta ? <><span aria-hidden>·</span><span>{i.payload.meta.split(' · ')[0]}</span></> : null}
                      </p>
                      <h3 className="mt-1 text-[15.5px] leading-snug font-semibold tracking-[-0.01em] text-ink text-pretty">{sentenceCase(i.title)}</h3>
                      <div className="mt-2.5"><InsightBody body={i.body} review={i.payload.review} kind={i.kind} /></div>
                      {actions.length ? (
                        <ul className="mt-3 flex flex-col gap-2">
                          {actions.map((a, n) => (
                            <li key={n} className="flex items-center gap-2.5 rounded-md bg-surface-2 px-3 py-2 text-[13px]">
                              <Repeat className="size-4 shrink-0" strokeWidth={1.5} style={{ color: CATEGORY[a.category].color }} />
                              <span className="font-medium text-ink">{a.name}</span>
                              <span className="truncate text-ink-3">
                                {a.type === 'schedule' ? describe(a.rrule.includes('DTSTART') ? a.rrule : `DTSTART:20260101T000000\n${a.rrule.startsWith('RRULE:') ? a.rrule : `RRULE:${a.rrule}`}`) : `New tracker${a.unit ? ` · ${a.unit}` : ''}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-4">{i.payload.recovery ? <Link href="/" className={buttonClass({ variant: 'primary', size: 'sm' })}>Choose recovery on Today</Link> : i.payload.goalDraft ? <Link href="/goals" className={buttonClass({ variant: 'primary', size: 'sm' })}>Review on Goals</Link> : <InsightActions id={i.id} hasActions={actions.length > 0} />}</div>
                    </article>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-5 pb-3">
              <EmptyState
                title="All caught up" icon={Inbox} color={'var(--cat-mind)'}
                description={enabled ? 'A nudge arrives each morning and a review every Sunday evening.' : 'Connect a model to get morning nudges and a Sunday review. Rule-based alerts work without one.'}
              />
            </div>
          )}
        </Card>
      </div>

      <aside aria-label="Plans and history" className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Active plans" icon={<Target strokeWidth={2} />} color="var(--cat-mind)" description={plans.length ? `${plans.length} running` : undefined} />
          {plans.length ? (
            <ul className="flex flex-col gap-3">
              {plans.map((p) => (
                <li key={p.id} className="flex items-start gap-2.5 text-sm text-ink">
                  <Target className="mt-0.5 size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
                  {p.goal}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-3">Approved plans show up here, and their steps become routines.</p>
          )}
        </Card>
        <Card className="pb-3">
          <CardHeader title="History" icon={<History strokeWidth={2} />} color="var(--ink-3)" description={history.length ? 'What you did with past insights' : undefined} className="mb-2" />
          {history.length ? (
            <ul className="-mx-1 flex flex-col divide-y divide-divider">
              {history.map((i) => {
                const k = KIND[i.kind]
                const s = STATUS[i.status] ?? { label: sentenceCase(i.status) }
                return (
                  <li key={i.id} className="flex items-center gap-3 px-1 py-2.5">
                    <k.icon className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-label={k.label} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13.5px] leading-snug text-ink">{sentenceCase(i.title)}</p>
                      <p className="text-[12px] text-ink-3">{formatDay(localDate(i.updatedAt, user.timezone))}</p>
                    </div>
                    <Badge color={s.color}>{s.label}</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="pb-2 text-[13px] text-ink-3">Nothing yet.</p>
          )}
        </Card>
        {modelId('chat') ? (
          <p className="flex items-center gap-2 px-1 text-[12px] text-ink-3">
            <Cpu className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>Model</span>
            <span className="truncate font-mono text-[11.5px] text-ink-2">{modelId('chat')}</span>
          </p>
        ) : null}
      </aside>
    </div>
  )
}

/** No model yet: one clear next step instead of a disabled box and a paragraph of provider names. */
function ConnectCoach() {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[20px] bg-surface p-5 shadow-1">
      <div aria-hidden className="flex -space-x-2">
        {['anthropic', 'openai', 'gemini'].map((l) => (
          <span key={l} className="grid size-10 place-items-center rounded-full bg-white shadow-[0_0_0_2px_var(--surface),0_0_0_3px_oklch(0_0_0/0.08)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- local logos */}
            <img src={`/connectors/${l}.svg`} alt="" className="size-5" />
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold text-ink">Connect an AI model to wake your coach</h2>
        <p className="mt-0.5 text-[13px] text-ink-3">Then ask anything about your data, and get a nudge each morning and a review every Sunday. Rule-based alerts already work.</p>
      </div>
      <Link href="/connectors" className={buttonClass({ variant: 'primary' })}>Choose a model</Link>
    </div>
  )
}
