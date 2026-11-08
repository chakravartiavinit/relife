import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq, sql } from 'drizzle-orm'
import { ChevronRight, CircleAlert, CircleCheck, Clock, EyeOff, Tag, type LucideIcon } from 'lucide-react'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { SPEND_CATEGORIES } from '@/core/categorize'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { groupOf, reasonFor, summarize } from '@/domain/inbox'
import { Card, CardHeader, IconChip, PageHeader, Skeleton } from '@/ui/components/card'
import { AppLogo } from '@/ui/components/app-logo'
import { BrandLogo } from '@/ui/components/brand-logo'
import { CategorySelect } from '@/ui/components/wealth/category-select'
import { RawEventActions, RetryAll } from '@/ui/components/raw-event-actions'
import { cn } from '@/ui/cn'

export const metadata: Metadata = { title: 'Inbox' }

export default function InboxPage() {
  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Needs a look"
        description="What ReLife couldn’t sort out by itself. Most of it fixes itself; the rest takes one tap, and ReLife learns from it."
      />
      <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[104px] rounded-lg" /><Skeleton className="h-[320px] rounded-lg" /></div>}>
        <Inbox />
      </Suspense>
    </>
  )
}

type RawEvent = typeof schema.rawEvents.$inferSelect

async function Inbox() {
  await connection()
  const user = await getUser()
  const R = schema.rawEvents
  const [failed, uncategorized, ignored, counts, dismissedOrders] = await Promise.all([
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.status, 'failed'))).orderBy(desc(R.at)).limit(100),
    db.select().from(schema.transactions)
      .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.category, 'Uncategorized')))
      .orderBy(desc(schema.transactions.at)).limit(50),
    db.select().from(R).where(and(eq(R.userId, user.id), eq(R.status, 'ignored'))).orderBy(desc(R.at)).limit(30),
    db.select({ status: R.status, n: sql<number>`count(*)::int` }).from(R).where(eq(R.userId, user.id)).groupBy(R.status),
    db.select({ key: sql<string>`${R.source} || ':' || (${R.body}->>'orderId')` }).from(R)
      .where(and(eq(R.userId, user.id), eq(R.status, 'ignored'), sql`${R.body} ? 'orderId'`)),
  ])
  // Item lists whose order was dismissed can't attach to anything: show them with their order under Skipped.
  const dismissed = new Set(dismissedOrders.map((d) => d.key))
  const orphan = (e: RawEvent) => {
    const b = e.body as { platform?: string; orderId?: string } | null
    return e.source.endsWith('-items') && dismissed.has(`${b?.platform}:${b?.orderId}`)
  }
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0
  const when = (d: Date) => `${formatDay(localDate(d, user.timezone))} · ${formatTime(d, user.timezone)}`
  const unread = failed.filter((e) => groupOf(e.status, e.error, orphan(e)) === 'needs')
  const waiting = failed.filter((e) => groupOf(e.status, e.error, orphan(e)) === 'waiting')
  const skipped = [...ignored, ...failed.filter(orphan)].sort((a, b) => b.at.getTime() - a.at.getTime())
  const skippedCount = count('ignored') + failed.filter(orphan).length
  const needs = unread.length + uncategorized.length

  return (
    <div className="flex flex-col gap-6">
      <Card as="div" className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Tile icon={needs ? CircleAlert : CircleCheck} label="Needs you" value={needs} color={needs ? 'var(--bad)' : 'var(--good)'} />
        <Tile icon={Clock} label="Waiting" value={waiting.length} color="var(--warn)" />
        <Tile icon={CircleCheck} label="Read by itself" value={count('parsed')} color="var(--good)" />
        <Tile icon={EyeOff} label="Skipped" value={skippedCount} color="var(--ink-3)" />
      </Card>

      {needs === 0 ? (
        <Card as="div" className="flex items-center gap-4" style={{ background: 'color-mix(in oklch, var(--good) 9%, var(--surface))' }}>
          <IconChip color="var(--good)"><CircleCheck className="size-4" strokeWidth={2} /></IconChip>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Nothing needs you</h2>
            <p className="mt-0.5 text-[13px] text-ink-3">
              ReLife read {count('parsed').toLocaleString('en')} messages by itself.
              {waiting.length ? ` ${waiting.length} ${waiting.length === 1 ? 'is' : 'are'} waiting on another message and will sort ${waiting.length === 1 ? 'itself' : 'themselves'} out.` : ''}
            </p>
          </div>
        </Card>
      ) : null}

      {unread.length ? (
        <Card>
          <CardHeader
            icon={<CircleAlert className="size-4" strokeWidth={2} />} color="var(--bad)"
            title="Couldn’t read" description="Retry after a parser fix, or dismiss what isn’t a payment or order."
            action={unread.length > 1 ? <RetryAll ids={unread.map((e) => e.id)} /> : undefined}
          />
          <ul className="flex flex-col divide-y divide-divider">{unread.map((e) => <EventRow key={e.id} e={e} when={when(e.at)} tone="bad" />)}</ul>
        </Card>
      ) : null}

      {uncategorized.length ? (
        <Card>
          <CardHeader icon={<Tag className="size-4" strokeWidth={2} />} color="var(--pill)" title="Pick a category" description="Choose once and ReLife remembers it for that app, shop or person." />
          <ul className="flex flex-col divide-y divide-divider">
            {uncategorized.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div className="flex min-w-0 items-center gap-3">
                  <BrandLogo name={t.merchant ?? t.upiId ?? '?'} />
                  <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-ink">{t.merchant ?? t.upiId ?? 'Unknown'}</div>
                  <div className="truncate text-[12.5px] text-ink-3 tabular-nums">{when(t.at)}{t.upiId && t.merchant ? ` · ${t.upiId}` : ''}</div>
                  </div>
                </div>
                <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                  <CategorySelect id={t.id} value={t.category ?? 'Uncategorized'} options={[...SPEND_CATEGORIES]} merchant={t.merchant ?? t.upiId ?? 'this merchant'} />
                </div>
                <span className={cn('text-end text-[14px] font-medium tabular-nums', t.amount > 0 ? 'text-good' : 'text-ink')}>
                  {formatMoney(t.amount, t.currency, { sign: t.amount > 0 })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {waiting.length ? (
        <Card>
          <CardHeader
            icon={<Clock className="size-4" strokeWidth={2} />} color="var(--warn)"
            title="Waiting" description="These sort themselves out: ReLife tries again every night."
            action={<RetryAll ids={waiting.map((e) => e.id)} label={waiting.length > 1 ? 'Try all now' : 'Try now'} />}
          />
          <ul className="flex flex-col divide-y divide-divider">{waiting.map((e) => <EventRow key={e.id} e={e} when={when(e.at)} tone="warn" />)}</ul>
        </Card>
      ) : null}

      {skipped.length ? (
        <details className="group rounded-lg bg-surface shadow-1">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-lg px-5 py-3 transition-[background-color] duration-150 hover:bg-ink/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
            <IconChip color="var(--ink-3)"><EyeOff className="size-4" strokeWidth={2} /></IconChip>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink">Skipped</span>
              <span className="block text-[13px] text-ink-3">{skippedCount} {skippedCount === 1 ? 'message' : 'messages'} no reader claimed, or that you dismissed</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-ink-3 transition-[rotate] duration-150 ease-out-quint group-open:rotate-90" strokeWidth={1.5} aria-hidden />
          </summary>
          <ul className="flex flex-col divide-y divide-divider px-5 pt-1 pb-5">
            {skipped.map((e) => <EventRow key={e.id} e={e} when={when(e.at)} tone="muted" dismiss={false} orphan={orphan(e)} />)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function Tile({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
        <Icon className="size-3.5" strokeWidth={1.5} style={{ color }} aria-hidden />{label}
      </div>
      <div className="mt-1.5 font-display text-[26px] leading-none font-bold tracking-[-0.025em] text-ink tabular-nums">{value.toLocaleString('en')}</div>
    </div>
  )
}

const TONE = { bad: 'text-bad', warn: 'text-ink-2', muted: 'text-ink-3' }
const TONE_ICON = { bad: CircleAlert, warn: Clock, muted: EyeOff }

/** One raw message, in words: app logo, what it is, items and amount, why it's here, and the original on request. */
function EventRow({ e, when, tone, dismiss = true, orphan = false }: { e: RawEvent; when: string; tone: keyof typeof TONE; dismiss?: boolean; orphan?: boolean }) {
  const s = summarize(e.source, e.body)
  const Icon = TONE_ICON[tone]
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <AppLogo id={s.app} size="xs" />
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-medium text-ink">{s.title}</p>
          {s.amount ? <span className="shrink-0 text-[14px] font-medium text-ink tabular-nums">{formatMoney(s.amount.value, s.amount.currency)}</span> : null}
        </div>
        <p className="text-[12.5px] text-ink-3 tabular-nums">{when}</p>

        {s.items?.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Items">
            {s.items.map((it, i) => <li key={i} className="h-6 max-w-full truncate sm:max-w-[28rem] rounded-full bg-surface-2 px-2.5 text-[12px] leading-6 text-ink-2" title={it}>{it}</li>)}
            {s.more ? <li className="flex h-6 items-center px-1 text-[12px] text-ink-3">+{s.more} more</li> : null}
          </ul>
        ) : s.text ? <p className="mt-1.5 line-clamp-2 text-[13px] break-words text-ink-2">{s.text}</p> : null}

        <p className={cn('mt-2.5 flex items-start gap-1.5 text-[12.5px] leading-snug', TONE[tone])}>
          <Icon className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />{reasonFor(e.status, e.error, orphan)}
        </p>

        <details className="group/raw mt-2">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-sm text-[12.5px] text-ink-3 transition-[color] duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-[rotate] duration-150 ease-out-quint group-open/raw:rotate-90" strokeWidth={1.5} aria-hidden />
            Original message
          </summary>
          <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-ink-2">
            {typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2)}
          </pre>
        </details>
      </div>
      <div className="col-start-2 sm:col-start-auto"><RawEventActions id={e.id} dismiss={dismiss} /></div>
    </li>
  )
}
