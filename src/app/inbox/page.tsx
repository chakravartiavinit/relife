import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { SPEND_CATEGORIES } from '@/core/categorize'
import { formatDay, formatTime, localDate } from '@/core/time'
import { formatMoney } from '@/domain/money'
import { Badge, Card, CardHeader, PageHeader, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { CategorySelect } from '@/ui/components/wealth/category-select'
import { RawEventActions } from '@/ui/components/raw-event-actions'

export const metadata: Metadata = { title: 'Inbox' }

export default function InboxPage() {
  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Needs a look"
        description="Messages ReLife couldn’t read and payments it couldn’t categorize. Fix one and it learns for next time."
      />
      <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[220px] rounded-lg" /><Skeleton className="h-[280px] rounded-lg" /></div>}>
        <Inbox />
      </Suspense>
    </>
  )
}

const TEXT_SOURCES = ['sms', 'icloud', 'inbox', 'ocr', 'gmail', 'ingest']

async function Inbox() {
  await connection()
  const user = await getUser()
  const [failed, uncategorized, ignored, counts] = await Promise.all([
    db.select().from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.status, 'failed')))
      .orderBy(desc(schema.rawEvents.at)).limit(50),
    db.select().from(schema.transactions)
      .where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.category, 'Uncategorized')))
      .orderBy(desc(schema.transactions.at)).limit(50),
    db.select().from(schema.rawEvents)
      .where(and(
        eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.status, 'ignored'),
        inArray(schema.rawEvents.source, TEXT_SOURCES),
      ))
      .orderBy(desc(schema.rawEvents.at)).limit(15),
    db.select({ status: schema.rawEvents.status, n: sql<number>`count(*)::int` }).from(schema.rawEvents)
      .where(eq(schema.rawEvents.userId, user.id)).groupBy(schema.rawEvents.status),
  ])
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0
  const when = (d: Date) => `${formatDay(localDate(d, user.timezone))} · ${formatTime(d, user.timezone)}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 text-[13px]">
        <Badge>{count('parsed')} parsed</Badge>
        <Badge color={count('failed') ? 'var(--bad)' : undefined}>{count('failed')} failed</Badge>
        <Badge>{count('ignored')} ignored</Badge>
        <Badge>{count('new')} queued</Badge>
      </div>

      <Card>
        <CardHeader title="Couldn’t read" description="Parser errors. Order emails wait here until the matching payment arrives, then retry daily." />
        {failed.length ? (
          <ul className="flex flex-col divide-y divide-divider">
            {failed.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[12px] text-ink-3">
                    <Badge>{e.source}</Badge>
                    <span className="tabular-nums">{when(e.at)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[13px] break-words text-ink-2">{preview(e.body)}</p>
                  {e.error ? <p className="mt-1 text-[12px] text-bad">{e.error}</p> : null}
                </div>
                <RawEventActions id={e.id} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing failed" description="Every message so far was understood." />
        )}
      </Card>

      <Card>
        <CardHeader title="Uncategorized payments" description="Pick a category once and ReLife remembers it for that merchant." />
        {uncategorized.length ? (
          <ul className="flex flex-col divide-y divide-divider">
            {uncategorized.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{t.merchant ?? t.upiId ?? 'Unknown'}</div>
                  <div className="truncate text-[12px] text-ink-3 tabular-nums">{when(t.at)}{t.upiId && t.merchant ? ` · ${t.upiId}` : ''}</div>
                </div>
                <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                  <CategorySelect id={t.id} value={t.category ?? 'Uncategorized'} options={[...SPEND_CATEGORIES]} merchant={t.merchant ?? t.upiId ?? 'this merchant'} />
                </div>
                <span className={t.amount > 0 ? 'text-right text-sm font-medium text-good tabular-nums' : 'text-right text-sm font-medium text-ink tabular-nums'}>
                  {formatMoney(t.amount, t.currency, { sign: t.amount > 0 })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Every payment has a category" />
        )}
      </Card>

      {ignored.length ? (
        <Card>
          <CardHeader title="Recently ignored" description="Messages no parser claimed. If one was a payment, add a sample to src/parsers/fixtures and retry." />
          <ul className="flex flex-col divide-y divide-divider">
            {ignored.map((e) => (
              <li key={e.id} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink-3 tabular-nums">{e.source} · {when(e.at)}</div>
                  <p className="mt-1 line-clamp-2 text-[13px] break-words text-ink-2">{preview(e.body)}</p>
                </div>
                <RawEventActions id={e.id} retryOnly />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

function preview(body: unknown): string {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const text = b.text ?? b.subject ?? b.body
    if (typeof text === 'string') return [typeof b.subject === 'string' && b.subject !== text ? b.subject : null, text].filter(Boolean).join(' · ')
  }
  return JSON.stringify(body).slice(0, 300)
}
