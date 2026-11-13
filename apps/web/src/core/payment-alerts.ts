import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { clearUserCache, type User } from './user'
import { formatTime } from './time'
import { formatMoney } from '@/domain/money'

// Bank credits and debits shown once in the dashboard (as toasts) the next time it's opened. Only money that
// moved through a bank or card account (bank SMS and alerts), not app order history. The "seen" mark is
// users.profile.paymentsSeenAt: everything recorded after it is new. The dashboard reads, shows, then marks seen,
// so a reload or a second tab in between never loses one.

export type PaymentAlert = { id: string; credit: boolean; title: string; detail: string }

/** First open: show what arrived in the last day rather than every payment on record. */
const FIRST_LOOK_MS = 86_400_000
const MAX = 20

/** Bank payments recorded since the last look, newest first. Read-only: the dashboard marks them seen once shown. */
export async function newPaymentsFor(user: User, now = new Date()): Promise<{ items: PaymentAlert[]; more: number; upTo: string | null }> {
  // Compared in SQL at full precision (Postgres keeps microseconds, JS Dates only milliseconds), and read
  // fresh: the user object can be cached for the life of the process, the mark changes every look.
  const firstLook = new Date(now.getTime() - FIRST_LOOK_MS).toISOString()
  const where = and(
    eq(schema.transactions.userId, user.id),
    inArray(schema.accounts.kind, ['bank', 'card']),
    sql`${schema.transactions.createdAt} > coalesce((select (profile->>'paymentsSeenAt')::timestamptz from ${schema.users} where id = ${user.id}), ${firstLook}::timestamptz)`,
    lte(schema.transactions.createdAt, now),
    // A file import is history, not a new payment; a linked row is the same payment as an app order.
    sql`${schema.transactions.meta}->>'importId' is null`,
    isNull(schema.transactions.linkedTo),
  )
  const [rows, [{ n, upTo }]] = await Promise.all([
    db.select({ t: schema.transactions, a: schema.accounts }).from(schema.transactions)
      .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
      .where(where).orderBy(desc(schema.transactions.at)).limit(MAX),
    db.select({ n: sql<number>`count(*)::int`, upTo: sql<string | null>`to_char(max(${schema.transactions.createdAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(schema.transactions)
      .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id)).where(where),
  ])
  const items = rows.map(({ t, a }) => {
    const credit = t.amount > 0
    const who = t.merchant ?? t.upiId
    return {
      id: t.id, credit,
      title: `${formatMoney(Math.abs(t.amount), t.currency, { sign: false })} ${credit ? 'received' : 'paid'}${who ? `${credit ? ' from' : ' to'} ${who}` : ''}`,
      detail: [a.name, formatTime(t.at, user.timezone), t.category && t.category !== 'Uncategorized' ? t.category : null].filter(Boolean).join(' · '),
    }
  })
  return { items, more: Math.max(0, n - items.length), upTo }
}

/** Everything recorded up to `upTo` has been shown. Only moves forward, so a slower tab can't bring old ones back. */
export async function markPaymentsSeen(user: User, upTo: string) {
  if (Number.isNaN(Date.parse(upTo))) return
  await db.update(schema.users)
    .set({ profile: sql`${schema.users.profile} || jsonb_build_object('paymentsSeenAt', to_char(greatest(coalesce((${schema.users.profile}->>'paymentsSeenAt')::timestamptz, '-infinity'::timestamptz), ${upTo}::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))` })
    .where(eq(schema.users.id, user.id))
  // The cached user still holds the old mark; the next profile save would write it back and repeat old payments.
  clearUserCache()
}
