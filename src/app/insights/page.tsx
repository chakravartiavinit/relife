import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq, ne } from 'drizzle-orm'
import { BellRing, CalendarRange, Lightbulb, Repeat, Sparkles, Target } from 'lucide-react'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { aiEnabled, modelId } from '@/ai'
import { describe } from '@/domain/recurrence'
import { formatDay, localDate } from '@/core/time'
import { Badge, Card, CardHeader, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { AskBox, InsightActions } from '@/ui/components/insight-ui'
import { CATEGORY } from '@/ui/tokens'

export const metadata: Metadata = { title: 'Insights' }

const KIND = {
  review: { label: 'Weekly review', icon: CalendarRange },
  nudge: { label: 'Nudge', icon: Lightbulb },
  plan: { label: 'Plan', icon: Target },
  alert: { label: 'Alert', icon: BellRing },
} as const

export default function InsightsPage({ searchParams }: PageProps<'/insights'>) {
  return (
    <>
      <PageHeader eyebrow="Insights" title="Your observer" description="Weekly reviews, nudges and plans from the model you choose. Nothing changes until you approve it." />
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
  const user = await getUser()
  const [pending, history, plans] = await Promise.all([
    db.select().from(schema.insights)
      .where(and(eq(schema.insights.userId, user.id), eq(schema.insights.status, 'pending')))
      .orderBy(desc(schema.insights.createdAt)).limit(30),
    db.select().from(schema.insights)
      .where(and(eq(schema.insights.userId, user.id), ne(schema.insights.status, 'pending')))
      .orderBy(desc(schema.insights.updatedAt)).limit(20),
    db.select().from(schema.plans)
      .where(and(eq(schema.plans.userId, user.id), eq(schema.plans.status, 'active')))
      .orderBy(desc(schema.plans.createdAt)),
  ])
  const enabled = aiEnabled('chat')

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <section aria-labelledby="ask-h">
          <h2 id="ask-h" className="sr-only">Ask your data</h2>
          <AskBox initial={initial} enabled={enabled} />
          {!enabled ? (
            <p className="mt-2 px-1 text-[13px] text-ink-3">
              Open <Link href="/connectors" className="font-medium text-ink underline decoration-ink-3/40 underline-offset-2 hover:decoration-ink">Connectors</Link> and connect Anthropic, OpenAI, Gemini, OpenRouter or a local model with a default model.
            </p>
          ) : null}
        </section>

        <Card>
          <CardHeader title="Waiting for you" description={pending.length ? `${pending.length} to review` : undefined} />
          {pending.length ? (
            <ul className="flex flex-col divide-y divide-divider">
              {pending.map((i) => {
                const k = KIND[i.kind]
                const actions = i.payload.actions ?? []
                return (
                  <li key={i.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="mb-2 flex items-center gap-2 text-[12px] text-ink-3">
                      <k.icon className="size-3.5" strokeWidth={1.5} />
                      <span className="font-medium">{k.label}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDay(localDate(i.createdAt, user.timezone))}</span>
                    </div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{i.title}</h3>
                    <div className="mt-1.5 flex max-w-[68ch] flex-col gap-2 text-[14px] leading-relaxed text-ink-2">
                      {i.body.split(/\n{2,}/).map((p, n) => <p key={n} className="whitespace-pre-wrap">{p}</p>)}
                    </div>
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
                    <div className="mt-4"><InsightActions id={i.id} hasActions={actions.length > 0} /></div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              title="All caught up"
              description={enabled ? 'A nudge arrives each morning and a review every Sunday evening.' : 'Connect a model to get morning nudges and a Sunday review. Rule-based alerts work without one.'}
            />
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader title="Active plans" />
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
            <p className="text-[13px] text-ink-3">Approved plans show up here, and their steps become routines.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="History" />
          {history.length ? (
            <ul className="flex flex-col gap-3">
              {history.map((i) => (
                <li key={i.id} className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{i.title}</div>
                    <div className="mt-0.5"><Badge color={i.status === 'accepted' || i.status === 'done' ? 'var(--good)' : undefined}>{i.status}</Badge></div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">Nothing yet.</p>
          )}
        </Card>
        <p className="px-1 text-[12px] text-ink-3">
          Model: {modelId('chat') ?? 'not configured'}
        </p>
      </div>
    </div>
  )
}
