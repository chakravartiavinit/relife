import { and, inArray, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

// Old rows nobody reads again: the Telegram outbox, reminder history, model call logs and raw events that
// were read long ago. Run daily by the prune-old-data job (src/jobs).

const DAY = 86_400_000
export const KEEP_DAYS = 90
/**
 * Raw events are also what a sync is checked against (the same event is not stored twice), so they stay longer
 * than the rest: a sync that re-reads old history after the event is gone would parse it again.
 */
export const KEEP_RAW_DAYS = 365

/** Delete old rows. Returns how many were removed per table. */
export async function pruneOldData(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY)
  const rawCutoff = new Date(now.getTime() - KEEP_RAW_DAYS * DAY)
  const R = schema.rawEvents
  const notifications = (await db.delete(schema.notifications).where(lt(schema.notifications.createdAt, cutoff))).count
  const reminders = (await db.delete(schema.reminders).where(lt(schema.reminders.sentAt, cutoff))).count
  const llmRuns = (await db.delete(schema.llmRuns).where(lt(schema.llmRuns.createdAt, cutoff))).count
  // Only events that were handled; new and failed ones still wait for the parser. The newest event of each
  // source stays (rules read the latest snapshot, e.g. Binance balances).
  const rawEvents = (await db.delete(R).where(and(
    lt(R.at, rawCutoff), inArray(R.status, ['parsed', 'ignored']),
    sql`${R.id} not in (select distinct on (user_id, source) id from raw_events order by user_id, source, at desc)`,
  ))).count
  // Uploads nobody finished (an import started but never run) are cancelled after a day.
  const imports = await (await import('./imports')).pruneImports(now)
  return { notifications, reminders, llmRuns, rawEvents, imports }
}
