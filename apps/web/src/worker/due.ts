// Pure timing logic for reminders, kept separate so it can be tested without a database.

export const CATCH_UP_WINDOW_MS = 12 * 60 * 60_000
export const LATE_AFTER_MS = 15 * 60_000

/**
 * Occurrence window to query so that reminder time (occurrence − offset) falls in (lastTick, now].
 * lastTick is clamped to the catch-up window, so long downtime never floods old reminders.
 */
export function occurrenceWindow(offsetMin: number, lastTick: Date, now: Date): [Date, Date] {
  const from = Math.max(lastTick.getTime(), now.getTime() - CATCH_UP_WINDOW_MS) + 1
  const off = offsetMin * 60_000
  return [new Date(from + off), new Date(now.getTime() + off)]
}

export function reminderAt(occurrence: Date, offsetMin: number) {
  return new Date(occurrence.getTime() - offsetMin * 60_000)
}

/** Send now, or fold into the catch-up digest when the reminder is stale (e.g. laptop was asleep). */
export function delivery(remindAt: Date, now: Date): 'send' | 'digest' {
  return now.getTime() - remindAt.getTime() > LATE_AFTER_MS ? 'digest' : 'send'
}
