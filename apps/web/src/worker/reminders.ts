import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { db, schema } from '@/db'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import type { Schedule } from '@/core/schedules'
import { formatTime } from '@/core/time'
import type { User } from '@/core/user'
import { occurrencesBetween } from '@/domain/recurrence'
import { isPayment, reminderMessage } from '@/bot/messages'
import { head } from '@/bot/ui'
import { delivery, occurrenceWindow, reminderAt } from './due'

let lastTick: Date | undefined
/** Reminders recorded but whose send threw: the retry tick sends them again. */
const unsent = new Set<string>()

/** One reminder pass: new occurrences since the last tick, plus expired snoozes. */
export async function remindTick(user: User, now = new Date()) {
  // First tick after start looks back over the catch-up window (see due.ts).
  const since = lastTick ?? new Date(0)

  const list = await db.select().from(schema.schedules)
    .where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true)))

  const digest: { s: Schedule; occ: Date }[] = []
  let failed = false
  for (const s of list) {
    const [from, to] = occurrenceWindow(s.remindOffsetMin, since, now)
    let occs: Date[]
    try {
      occs = occurrencesBetween(s.rrule, from, to, user.timezone)
    } catch (e) {
      // A malformed rule must not stop every other reminder; skip it (its window can never be read anyway).
      console.error(`[reminders] schedule ${s.id} has a bad rule:`, e instanceof Error ? e.message : e)
      continue
    }
    try {
      for (const occ of occs) {
        if (await alreadyChecked(s.id, occ)) continue
        let [row] = await db.insert(schema.reminders).values({ scheduleId: s.id, occurrence: occ })
          .onConflictDoNothing().returning()
        if (!row) {
          // Already recorded. Only one whose send threw on an earlier tick (unsent) is sent again.
          const [prev] = await db.select().from(schema.reminders)
            .where(and(eq(schema.reminders.scheduleId, s.id), eq(schema.reminders.occurrence, occ))).limit(1)
          if (!prev || !unsent.has(prev.id)) continue // already reminded
          row = prev
        }
        if (delivery(reminderAt(occ, s.remindOffsetMin), now) === 'digest') {
          digest.push({ s, occ })
          continue
        }
        unsent.add(row.id)
        await sendReminder(user, s, occ, row.id)
        unsent.delete(row.id)
      }
    } catch (e) {
      failed = true // keep the window open so the next tick retries it (inserts are idempotent)
      console.error(`[reminders] schedule ${s.id} failed:`, e instanceof Error ? e.message : e)
    }
  }

  if (digest.length) {
    const lines = digest
      .sort((a, b) => a.occ.getTime() - b.occ.getTime())
      .map(({ s, occ }) => `▫️ ${formatTime(occ, user.timezone)} ${esc(s.name)}${isPayment(s) ? ' <i>· payment due soon</i>' : ''}`)
    await notify(user, 'reminders', {
      text: `${head('👋', 'While you were away', `${digest.length} ${digest.length === 1 ? 'reminder' : 'reminders'}`)}\n${lines.join('\n')}`,
      buttons: [[{ text: '📋 Check them off', data: 't:o' }]],
      once: true,
    })
  }

  // Snoozed reminders whose time has come.
  const snoozed = await db.select({ r: schema.reminders, s: schema.schedules })
    .from(schema.reminders)
    .innerJoin(schema.schedules, eq(schema.reminders.scheduleId, schema.schedules.id))
    .where(and(isNotNull(schema.reminders.snoozedUntil), lte(schema.reminders.snoozedUntil, now), eq(schema.schedules.userId, user.id)))
  for (const { r, s } of snoozed) {
    await db.update(schema.reminders).set({ snoozedUntil: null }).where(eq(schema.reminders.id, r.id))
    if (await alreadyChecked(s.id, r.occurrence)) continue
    await sendReminder(user, s, r.occurrence, r.id)
  }
  if (!failed) lastTick = now
}

async function alreadyChecked(scheduleId: string, occurrence: Date) {
  const [c] = await db.select({ id: schema.checks.id }).from(schema.checks)
    .where(and(eq(schema.checks.scheduleId, scheduleId), eq(schema.checks.occurrence, occurrence)))
  return !!c
}

async function sendReminder(user: User, s: Schedule, occ: Date, rid: string) {
  const { text, buttons } = await reminderMessage(user, s, occ, rid)
  await notify(user, 'reminders', { text, buttons, ref: `reminder:${rid}` })
}
