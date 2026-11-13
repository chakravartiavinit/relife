import { isIPv6 } from 'node:net'

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

/**
 * What the rate limit counts as one visitor: an IPv4 address as is, an IPv6 address by its /64 (one household or
 * host gets the whole /64, so rotating the low 64 bits can't dodge the limit). IPv4-mapped IPv6 counts as IPv4.
 */
export function ipGroup(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return mapped[1]
  if (!isIPv6(ip)) return ip
  const [head, tail = ''] = ip.split('::')
  const groups = head ? head.split(':') : []
  const rest = tail ? tail.split(':') : []
  const full = ip.includes('::') ? [...groups, ...Array(8 - groups.length - rest.length).fill('0'), ...rest] : groups
  return `${full.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`
}
