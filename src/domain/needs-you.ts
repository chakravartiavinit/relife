// What needs the user's attention, shared by the Coach list and the badge so the two always agree.

/** A nudge leaves the queue (and the badge) this many days after it was written; it stays in History. */
export const NUDGE_TTL_DAYS = 3

/** The three things that count: AI decisions waiting, data ReLife could not read, merchants with no category. */
export type NeedsYou = { total: number; decisions: number; data: number }

/** `data` = messages nobody can retry for you + payments waiting for a category (one per merchant). */
export function needsYou(decisions: number, unread: number, merchants: number): NeedsYou {
  const data = unread + merchants
  return { total: decisions + data, decisions, data }
}
