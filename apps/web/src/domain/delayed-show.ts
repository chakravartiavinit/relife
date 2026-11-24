/**
 * When a loader may be on screen. Waits that end quickly show nothing (no flash); a wait that shows stays up long
 * enough to read as one thing. Times are in milliseconds on any one clock.
 *   - nothing shows before `delay` has passed since the wait started;
 *   - a wait that ends before `delay` never shows;
 *   - once shown, it stays at least `minVisible` (counted from when it appeared), then goes when the wait is over.
 */
export type DelayedShowInput = {
  startedAt: number
  /** When the wait ended, or null while it is still going. */
  endedAt: number | null
  now: number
  delay: number
  minVisible: number
}

export function delayedShow({ startedAt, endedAt, now, delay, minVisible }: DelayedShowInput): { visible: boolean; recheckIn: number | null } {
  const shownAt = startedAt + delay
  if (endedAt != null && endedAt < shownAt) return { visible: false, recheckIn: null }
  if (now < shownAt) return { visible: false, recheckIn: shownAt - now }
  if (endedAt == null) return { visible: true, recheckIn: null }
  const hideAt = Math.max(endedAt, shownAt + minVisible)
  return now < hideAt ? { visible: true, recheckIn: hideAt - now } : { visible: false, recheckIn: null }
}
