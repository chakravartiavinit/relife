// Windows from the plan: per IP 5 submits / 10 min and 20 / day; per email one send / 2 min and 5 / day.
export const IP_LIMITS = [
  { windowMs: 10 * 60_000, max: 5 },
  { windowMs: 24 * 60 * 60_000, max: 20 },
] as const
export const EMAIL_LIMITS = [
  { windowMs: 2 * 60_000, max: 1 },
  { windowMs: 24 * 60 * 60_000, max: 5 },
] as const

type Limit = { readonly windowMs: number; readonly max: number }

/** True when `attempts` (timestamps in ms, already recorded) leave no room in any window at `now`. */
export function isLimited(attempts: number[], limits: readonly Limit[], now = Date.now()): boolean {
  return limits.some((l) => attempts.filter((t) => now - t < l.windowMs).length >= l.max)
}
