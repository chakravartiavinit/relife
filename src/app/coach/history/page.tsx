import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChevronRight, Clock, EyeOff, Target } from 'lucide-react'
import { loadCoachHistory, type HistoryEvent } from '@/core/coach-history'
import { formatDay, formatTime, localDate } from '@/core/time'
import { getUser } from '@/core/user'
import { formatMoney } from '@/domain/money'
import { reasonFor, summarize } from '@/domain/inbox'
import { sentenceCase } from '@/domain/text'
import { cn } from '@/ui/cn'
import { AppLogo } from '@/ui/components/app-logo'
import { buttonClass } from '@/ui/components/button'
import { Badge, Card, IconChip, Skeleton } from '@/ui/components/card'
import { CoachTabs } from '@/ui/components/coach/coach-tabs'
import { QUEUE_KIND } from '@/ui/components/coach/kinds'
import { STATUS } from '@/ui/components/insight-kinds'
import { PeekLink } from '@/ui/components/peek/peek-link'
import { RawEventActions, RetryAll } from '@/ui/components/raw-event-actions'

export const metadata: Metadata = { title: 'History · Coach' }

const SHOW = [{ key: null, label: 'All' }, { key: 'decisions', label: 'Decisions' }, { key: 'plans', label: 'Plans' }, { key: 'data', label: 'Data' }] as const

export default function HistoryPage({ searchParams }: PageProps<'/coach/history'>) {
  return (
    <div className="flex max-w-[52rem] flex-col gap-4">
      <CoachTabs />
      <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><History searchParams={searchParams} /></Suspense>
    </div>
  )
}

const sectionTitle = 'font-mono text-label uppercase text-ink-3'

async function History({ searchParams }: { searchParams: PageProps<'/coach/history'>['searchParams'] }) {
  await connection()
  const sp = await searchParams
  const show = sp.show === 'decisions' || sp.show === 'plans' || sp.show === 'data' ? sp.show : null
  const user = await getUser()
  const h = await loadCoachHistory(user)
  const when = (iso: string) => formatDay(localDate(new Date(iso), user.timezone))
  const eventWhen = (d: Date) => `${formatDay(localDate(d, user.timezone))} · ${formatTime(d, user.timezone)}`
  const dataCount = h.waiting.length + h.skipped.length

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Show" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {SHOW.map((f) => {
          const active = f.key === show
          return (
            <Link
              key={f.key ?? 'all'} href={f.key ? `/coach/history?show=${f.key}` : '/coach/history'} scroll={false} aria-current={active ? 'page' : undefined}
              className={buttonClass({ variant: active ? 'primary' : 'secondary', size: 'sm', className: cn('shrink-0 rounded-full', !active && 'font-normal text-ink-2') })}
            >{f.label}</Link>
          )
        })}
      </nav>

      {show === null || show === 'decisions' ? (
        <Card as="section" aria-labelledby="decisions-h" className="px-0 pb-0">
          <h2 id="decisions-h" className={cn(sectionTitle, 'px-5 pb-3')}>Decisions</h2>
          {h.decisions.length ? (
            <ul className="flex flex-col divide-y divide-divider border-t border-divider">
              {h.decisions.map((d) => {
                const k = QUEUE_KIND[d.kind]
                const status = d.expired ? { label: 'Expired after 3 days' } : STATUS[d.status] ?? { label: d.status }
                return (
                  <li key={d.id} className="flex items-start gap-3.5 px-5 py-4">
                    <IconChip color={k.color} className="mt-px size-9 rounded-[12px] [&_svg]:size-[18px]"><k.icon strokeWidth={1.5} /></IconChip>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-label uppercase text-ink-3"><span className="text-ink-2">{k.label}</span> <span aria-hidden>·</span> {when(d.at)}</p>
                      <p className="mt-1 text-body font-semibold text-ink text-pretty">{sentenceCase(d.title)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge color={status.color}>{status.label}</Badge>
                      <PeekLink to={{ type: 'insight', id: d.id }} className="inline-flex min-h-10 items-center rounded-sm px-1 text-small font-medium text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">Why?</PeekLink>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <p className="border-t border-divider px-5 py-8 text-center text-body text-ink-3">Nothing decided yet. Cards you handle in Needs you land here.</p>}
        </Card>
      ) : null}

      {show === null || show === 'plans' ? (
        <Card as="section" aria-labelledby="plans-h">
          <h2 id="plans-h" className={sectionTitle}>Active plans</h2>
          {h.plans.length ? (
            <ul className="mt-3 flex flex-col gap-3">
              {h.plans.map((p) => (
                <li key={p.id} className="flex items-start gap-2.5 text-body text-ink"><Target className="mt-0.5 size-4 shrink-0 text-pill-ink" strokeWidth={1.5} aria-hidden />{p.goal}</li>
              ))}
            </ul>
          ) : <p className="mt-2 text-body text-ink-3">Approved plans show up here, and their steps become routines.</p>}
        </Card>
      ) : null}

      {show === null || show === 'data' ? (
        <Card as="section" aria-labelledby="data-h" className="px-0 pb-0">
          <div className="flex items-start justify-between gap-3 px-5 pb-3">
            <div>
              <h2 id="data-h" className={sectionTitle}>Data</h2>
              <p className="mt-1 text-small text-ink-3 tabular-nums">ReLife read {h.readByItself.toLocaleString('en')} messages by itself.</p>
            </div>
            {h.waiting.length ? <RetryAll ids={h.waiting.map((e) => e.id)} label={h.waiting.length > 1 ? 'Try all now' : 'Try now'} /> : null}
          </div>
          {h.waiting.length ? (
            <div className="border-t border-divider">
              <h3 className="flex items-center gap-1.5 px-5 pt-3 text-small font-medium text-ink-2"><Clock className="size-3.5 text-warn" strokeWidth={1.5} aria-hidden />Waiting · {h.waiting.length}</h3>
              <ul className="divide-y divide-divider">{h.waiting.map((e) => <EventRow key={e.id} e={e} when={eventWhen(e.at)} orphan={h.orphan(e)} />)}</ul>
            </div>
          ) : null}
          {h.skipped.length ? (
            <details className="group border-t border-divider">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3 text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                <EyeOff className="size-3.5 text-ink-3" strokeWidth={1.5} aria-hidden />Skipped · {h.skipped.length}
                <ChevronRight className="ml-auto size-4 text-ink-3 transition-[rotate] duration-150 ease-out-quint group-open:rotate-90" strokeWidth={1.5} aria-hidden />
              </summary>
              <ul className="divide-y divide-divider">{h.skipped.map((e) => <EventRow key={e.id} e={e} when={eventWhen(e.at)} orphan={h.orphan(e)} skipped />)}</ul>
            </details>
          ) : null}
          {dataCount === 0 ? <p className="border-t border-divider px-5 py-8 text-center text-body text-ink-3">Nothing is waiting and nothing was skipped.</p> : null}
        </Card>
      ) : null}
    </div>
  )
}

/** One message in words: the app, what it is, the amount, why it is here. Read-only apart from Retry. */
function EventRow({ e, when, orphan, skipped = false }: { e: HistoryEvent; when: string; orphan: boolean; skipped?: boolean }) {
  const s = summarize(e.source, e.body)
  return (
    <li className="flex items-start gap-3.5 px-5 py-4">
      <AppLogo id={s.app} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-body font-medium text-ink">{s.title}</p>
          {s.amount ? <span className="shrink-0 text-body font-medium text-ink tabular-nums">{formatMoney(s.amount.value, s.amount.currency)}</span> : null}
        </div>
        <p className="text-small text-ink-3 tabular-nums">{when}</p>
        <p className="mt-1.5 text-small text-ink-2 text-pretty">{reasonFor(e.status, e.error, orphan)}</p>
      </div>
      <RawEventActions id={e.id} dismiss={!skipped} />
    </li>
  )
}
