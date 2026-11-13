import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { parsers } from '@/parsers'
import { categorize } from './categorize'
import { localDate } from './time'
import { getUser, type User } from './user'
import type { AccountRef, RawEvent, Rec, TrackerDefaults } from './types'

/** Store a raw event as-is. Duplicate (source, externalId) is ignored, so re-syncs are safe. */
export async function emitRaw(userId: string, e: RawEvent): Promise<boolean> {
  const rows = await db.insert(schema.rawEvents)
    .values({ userId, source: e.source, externalId: e.externalId, at: e.at, body: e.body as object })
    .onConflictDoNothing()
    .returning({ id: schema.rawEvents.id })
  return rows.length > 0
}

/** Store many raw events in one statement. Duplicates are skipped. Returns how many were new. */
export async function emitRawMany(userId: string, events: RawEvent[]): Promise<number> {
  if (!events.length) return 0
  const rows = await db.insert(schema.rawEvents)
    .values(events.map((e) => ({ userId, source: e.source, externalId: e.externalId, at: e.at, body: e.body as object })))
    .onConflictDoNothing()
    .returning({ id: schema.rawEvents.id })
  return rows.length
}

/** Parse every `new` raw event. Returns counts for logging. */
export async function processNew(limit = 500) {
  const user = await getUser()
  const rows = await db.select().from(schema.rawEvents)
    .where(and(eq(schema.rawEvents.userId, user.id), eq(schema.rawEvents.status, 'new')))
    .orderBy(asc(schema.rawEvents.at))
    .limit(limit)
  const counts = { parsed: 0, ignored: 0, failed: 0 }
  for (const row of rows) {
    const status = await processOne(user, row)
    counts[status]++
  }
  return counts
}

/** Re-run parsers on one raw event (also used by the Inbox "retry" button). */
export async function processOne(user: User, row: typeof schema.rawEvents.$inferSelect) {
  const ev: RawEvent = { source: row.source, externalId: row.externalId, at: row.at, body: row.body }
  const parser = parsers.find((p) => p.match(ev))
  if (!parser) {
    await db.update(schema.rawEvents).set({ status: 'ignored', parserId: null, error: null }).where(eq(schema.rawEvents.id, row.id))
    return 'ignored' as const
  }
  try {
    const recs = await parser.parse(ev, { user, db })
    for (const rec of recs) await persist(user, rec, row.id)
    const status = recs.length || parser.enriches ? 'parsed' : 'ignored'
    await db.update(schema.rawEvents).set({ status, parserId: parser.id, error: null }).where(eq(schema.rawEvents.id, row.id))
    return status
  } catch (err) {
    await db.update(schema.rawEvents)
      .set({ status: 'failed', parserId: parser.id, error: String(err instanceof Error ? err.message : err) })
      .where(eq(schema.rawEvents.id, row.id))
    return 'failed' as const
  }
}

export async function persist(user: User, rec: Rec, rawEventId?: string) {
  switch (rec.kind) {
    case 'entry': {
      const tracker = await ensureTracker(user.id, rec.tracker, rec.defaults)
      const value = rec.mode === 'add'
        ? sql`${schema.entries.value} + ${rec.value}`
        : sql`${rec.value}`
      await db.insert(schema.entries).values({
        userId: user.id, trackerId: tracker.id, localDate: rec.date, value: rec.value, source: rec.source,
        verified: rec.verified ?? rec.source !== 'manual', note: rec.note, meta: rec.meta ?? {},
      }).onConflictDoUpdate({
        target: [schema.entries.trackerId, schema.entries.localDate, schema.entries.source],
        // Only a changed value counts as newer: re-parsing a day mustn't make one device's sleep win over another's.
        // An add keeps the keys already there (quick logs record each add under its ref, so Undo can take back one).
        set: { value, note: rec.note, meta: rec.mode === 'add' ? sql`${schema.entries.meta} || excluded.meta` : rec.meta ?? {}, updatedAt: sql`case when ${schema.entries.value} is distinct from excluded.value then now() else ${schema.entries.updatedAt} end` },
      })
      return
    }
    case 'transaction': {
      const account = await ensureAccount(user.id, rec.account)
      const { merchant, category } = await categorize(user.id, rec.merchant, rec.upiId)
      await db.insert(schema.transactions).values({
        userId: user.id, accountId: account.id, at: rec.at, localDate: localDate(rec.at, user.timezone),
        amount: rec.amount, currency: rec.currency, merchant, upiId: rec.upiId,
        category: rec.amount > 0 && category === 'Uncategorized' ? 'Income' : category,
        source: rec.source, externalRef: rec.externalRef, rawEventId, meta: rec.meta ?? {},
      }).onConflictDoNothing()
      if (rec.balance !== undefined) await setBalance(account.id, rec.balance, rec.at)
      return
    }
    case 'trade': {
      const account = await ensureAccount(user.id, rec.account)
      await db.insert(schema.trades).values({
        userId: user.id, accountId: account.id, at: rec.at, symbol: rec.symbol, side: rec.side,
        qty: rec.qty, price: rec.price, fee: rec.fee, feeAsset: rec.feeAsset, kind: rec.tradeKind ?? 'spot',
        source: rec.source, externalRef: rec.externalRef, meta: rec.meta ?? {},
      }).onConflictDoNothing()
      return
    }
    case 'holding': {
      const account = await ensureAccount(user.id, rec.account)
      await db.insert(schema.holdings).values({
        userId: user.id, accountId: account.id, asset: rec.asset, qty: rec.qty, priceUsd: rec.priceUsd, at: rec.at,
      }).onConflictDoUpdate({
        target: [schema.holdings.accountId, schema.holdings.asset],
        set: { qty: rec.qty, priceUsd: rec.priceUsd, at: rec.at },
      })
      return
    }
    case 'balance': {
      const account = await ensureAccount(user.id, rec.account)
      await setBalance(account.id, rec.amount, rec.at)
      if (rec.meta) await db.update(schema.accounts).set({ meta: rec.meta }).where(eq(schema.accounts.id, account.id))
      return
    }
    case 'flow': {
      const account = await ensureAccount(user.id, rec.account)
      await db.insert(schema.cryptoFlows).values({
        userId: user.id, accountId: account.id, at: rec.at, kind: rec.flow, asset: rec.asset, amount: rec.amount, usd: rec.usd,
        symbol: rec.symbol, source: rec.source, externalRef: rec.externalRef, meta: rec.meta ?? {},
      }).onConflictDoNothing()
      return
    }
  }
}

async function setBalance(accountId: string, amount: number, at: Date) {
  // Only move forward in time: an old SMS processed late must not overwrite a newer balance.
  await db.update(schema.accounts)
    .set({ latestBalance: amount, balanceAt: at })
    .where(and(
      eq(schema.accounts.id, accountId),
      or(isNull(schema.accounts.balanceAt), lte(schema.accounts.balanceAt, at)),
    ))
}

export async function ensureAccount(userId: string, ref: AccountRef) {
  const [row] = await db.insert(schema.accounts).values({
    userId, key: ref.key, kind: ref.kind, name: ref.name, institution: ref.institution, currency: ref.currency ?? 'INR',
  }).onConflictDoUpdate({
    target: [schema.accounts.userId, schema.accounts.key],
    set: { updatedAt: new Date() },
  }).returning()
  return row
}

export async function ensureTracker(userId: string, slug: string, d: TrackerDefaults = {}) {
  const [found] = await db.select().from(schema.trackers)
    .where(and(eq(schema.trackers.userId, userId), eq(schema.trackers.slug, slug)))
  if (found) return found
  const [row] = await db.insert(schema.trackers).values({
    userId, slug,
    name: d.name ?? humanize(slug),
    category: d.category ?? guessCategory(slug),
    kind: d.kind ?? 'number',
    unit: d.unit, target: d.target, direction: d.direction ?? 'up', aggregate: d.aggregate ?? 'sum',
  }).onConflictDoNothing().returning()
  if (row) return row
  const [again] = await db.select().from(schema.trackers)
    .where(and(eq(schema.trackers.userId, userId), eq(schema.trackers.slug, slug)))
  return again
}

function humanize(slug: string) {
  const s = slug.split('.').pop()!.replace(/[-_]/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function guessCategory(slug: string) {
  const s = slug.toLowerCase()
  if (/^(github|leetcode|learn|read|course|practice|code)/.test(s)) return 'skills' as const
  if (/^(spend|save|money|invest)/.test(s)) return 'wealth' as const
  if (/^(mood|journal|meditat|screen|focus|energy)/.test(s)) return 'mind' as const
  if (/^(call|people|friends|family)/.test(s)) return 'relationships' as const
  if (/^(guitar|piano|music|sing|draw|paint|sketch|photo|chess|cook|bake|garden|game|knit|craft|dance|hobby)/.test(s)) return 'hobbies' as const
  return 'health' as const
}
