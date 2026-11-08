import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Category } from '@/db/schema'
import { convert } from './fx'
import type { User } from './user'

export type Tracker = typeof schema.trackers.$inferSelect

/** Daily values per tracker in [from, to] (local dates). Sums across sources, or takes the latest for 'last' trackers. */
export async function trackerDays(user: User, from: string, to: string, opts: { slugs?: string[]; category?: Category } = {}) {
  const trackers = await db.select().from(schema.trackers).where(and(
    eq(schema.trackers.userId, user.id),
    isNull(schema.trackers.archivedAt),
    opts.slugs ? inArray(schema.trackers.slug, opts.slugs) : undefined,
    opts.category ? eq(schema.trackers.category, opts.category) : undefined,
  ))
  if (!trackers.length) return []
  const rows = await db.select({
    trackerId: schema.entries.trackerId,
    date: schema.entries.localDate,
    sum: sql<string>`sum(${schema.entries.value})`,
    last: sql<string>`(array_agg(${schema.entries.value} order by ${schema.entries.updatedAt} desc))[1]`,
    verified: sql<boolean>`bool_or(${schema.entries.verified})`,
  }).from(schema.entries).where(and(
    inArray(schema.entries.trackerId, trackers.map((t) => t.id)),
    gte(schema.entries.localDate, from),
    lte(schema.entries.localDate, to),
  )).groupBy(schema.entries.trackerId, schema.entries.localDate)

  return trackers.map((t) => {
    const days = new Map<string, number>()
    let verified = false
    for (const r of rows) {
      if (r.trackerId !== t.id) continue
      days.set(r.date, Number(t.aggregate === 'last' ? r.last : r.sum))
      verified ||= r.verified
    }
    return { tracker: t, days, verified }
  })
}

export type Txn = typeof schema.transactions.$inferSelect & { base: number }

/** Transactions in [from, to] with amounts converted to the user's base currency. */
export async function transactionsBetween(user: User, from: string, to: string) {
  const rows = await db.select().from(schema.transactions).where(and(
    eq(schema.transactions.userId, user.id),
    gte(schema.transactions.localDate, from),
    lte(schema.transactions.localDate, to),
  )).orderBy(sql`${schema.transactions.at} desc`)
  const out: Txn[] = []
  for (const r of rows) {
    const base = r.currency === user.baseCurrency ? r.amount : await convert(r.amount, r.currency, user.baseCurrency, r.localDate)
    out.push({ ...r, base: base ?? 0 })
  }
  return out
}

const NOT_SPEND = new Set(['Transfers', 'Investments', 'Income'])

/** Money out, excluding transfers between own accounts and investments. */
export function isSpend(t: { base: number; category: string | null }) {
  return t.base < 0 && !NOT_SPEND.has(t.category ?? '')
}

/**
 * Days the user did something on purpose: a routine checked off, a manual log, or code shipped. Passive
 * syncs (sleep, steps) don't count. Days a streak freeze covered count too, so every streak survives them.
 */
export async function activeDays(user: User, from: string) {
  const [checks, entries, frozen] = await Promise.all([
    db.selectDistinct({ d: schema.checks.localDate }).from(schema.checks)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.checks.scheduleId))
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.checks.status, 'done'), gte(schema.checks.localDate, from))),
    db.selectDistinct({ d: schema.entries.localDate }).from(schema.entries)
      .where(and(
        eq(schema.entries.userId, user.id), gte(schema.entries.localDate, from),
        or(eq(schema.entries.source, 'manual'), and(eq(schema.entries.source, 'github'), gt(schema.entries.value, 0))),
      )),
    db.select({ d: schema.streakFreezes.localDate }).from(schema.streakFreezes)
      .where(and(eq(schema.streakFreezes.userId, user.id), gte(schema.streakFreezes.localDate, from))),
  ])
  return new Set([...checks, ...entries, ...frozen].map((r) => r.d))
}
