import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { formatMoney, formatNumber } from '@/domain/money'
import { LAST_VALUE, quickLogUndo, type QuickLog, type QuickLogUndo } from '@/domain/quicklog'
import { persist } from './ingest'
import { trackerDays } from './metrics'
import { localDate } from './time'
import type { User } from './user'

// The grammar itself lives in src/domain/quicklog.ts so the client can import it; this file applies it.
export { LAST_VALUE, UNIT_WORDS, parseQuickLog, slugify, type QuickLog } from '@/domain/quicklog'

/** The typed-in (manual) value a tracker has on a day, or null: what a set-not-add log overwrites. */
async function manualValue(user: User, slug: string, date: string): Promise<number | null> {
  const [row] = await db.select({ value: schema.entries.value }).from(schema.entries)
    .innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
    .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.slug, slug), eq(schema.entries.localDate, date), eq(schema.entries.source, 'manual')))
  return row ? Number(row.value) : null
}

export async function applyQuickLog(user: User, q: QuickLog, now = new Date()): Promise<string> {
  return (await applyQuickLogWithUndo(user, q, now)).message
}

/** Applies a log and says how to take it back. Telegram and the extension only need the message; Capture keeps the token. */
export async function applyQuickLogWithUndo(user: User, q: QuickLog, now = new Date()): Promise<{ message: string; undo: QuickLogUndo }> {
  const date = localDate(now, user.timezone)
  const externalRef = `manual:${now.getTime()}`
  const prev = q.type === 'entry' && LAST_VALUE.has(q.slug) ? await manualValue(user, q.slug, date) : null
  const undo = quickLogUndo(q, { date, prev, externalRef })
  return { message: await writeQuickLog(user, q, now, date, externalRef), undo }
}

async function writeQuickLog(user: User, q: QuickLog, now: Date, date: string, externalRef: string): Promise<string> {
  if (q.type === 'entry') {
    const last = LAST_VALUE.has(q.slug)
    await persist(user, {
      kind: 'entry', tracker: q.slug, date, value: q.value, source: 'manual', mode: last ? 'set' : 'add',
      meta: last ? undefined : { [externalRef]: q.value },
      defaults: last ? { aggregate: 'last', kind: q.slug === 'mood' || q.slug === 'energy' ? 'scale' : 'number' } : undefined,
    })
    // Say it back in the tracker's own words: "Water +250 ml · 750 ml today", "Mood: 4".
    const [t] = await trackerDays(user, date, date, { slugs: [q.slug] })
    const name = t?.tracker.name ?? q.slug
    const unit = t?.tracker.unit ? ` ${t.tracker.unit}` : ''
    if (last || !t) return `${name}: ${formatNumber(q.value, q.value % 1 ? 1 : 0)}${unit}`
    const total = t.days.get(date) ?? q.value
    return `${name} +${formatNumber(q.value, q.value % 1 ? 1 : 0)}${unit} · ${formatNumber(total, total % 1 ? 1 : 0)}${unit} today`
  }
  await persist(user, {
    kind: 'transaction',
    account: { key: 'manual:cash', kind: 'manual_asset', name: 'Cash & manual', currency: q.currency },
    at: now, amount: -Math.abs(q.amount), currency: q.currency, merchant: q.note,
    source: 'manual', externalRef,
  })
  return `Spent ${formatMoney(q.amount, q.currency)} · ${q.note}`
}

/**
 * Takes a quick log back. An add is reversed by its ref: one statement subtracts the value stored under the ref and
 * removes the ref, so a second Undo (double tap, retry, another tab) finds nothing and changes nothing. A set goes back
 * to what the day had (or the manual entry goes away); a spend is deleted by its `manual:` reference. Everything is
 * scoped to `user`.
 */
export async function undoQuickLogWrite(user: User, u: QuickLogUndo) {
  if (u.kind === 'entry') {
    const e = schema.entries
    const tracker = db.select({ id: schema.trackers.id }).from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, u.slug)))
    const [row] = await db.update(e)
      .set({ value: sql`${e.value} - (${e.meta} ->> ${u.ref})::numeric`, meta: sql`${e.meta} - ${u.ref}`, updatedAt: sql`now()` })
      .where(and(eq(e.userId, user.id), inArray(e.trackerId, tracker), eq(e.localDate, u.date), eq(e.source, 'manual'), sql`${e.meta} ? ${u.ref}`))
      .returning({ id: e.id })
    // A day that is back to 0 was never logged: drop the row so it does not count as a logged day.
    if (row) await db.delete(e).where(and(eq(e.id, row.id), eq(e.value, 0)))
  } else if (u.kind === 'set') {
    if (u.prev !== null) {
      await persist(user, { kind: 'entry', tracker: u.slug, date: u.date, value: u.prev, source: 'manual', mode: 'set' })
      return
    }
    const [t] = await db.select({ id: schema.trackers.id }).from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.slug, u.slug)))
    if (t) await db.delete(schema.entries).where(and(eq(schema.entries.userId, user.id), eq(schema.entries.trackerId, t.id), eq(schema.entries.localDate, u.date), eq(schema.entries.source, 'manual')))
  } else {
    await db.delete(schema.transactions).where(and(eq(schema.transactions.userId, user.id), eq(schema.transactions.source, 'manual'), eq(schema.transactions.externalRef, u.externalRef)))
  }
}
