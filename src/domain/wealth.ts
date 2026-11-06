// Pure wealth helpers shared by the Wealth pages.

/** Sign an account balance for net worth: debts (loans, card dues) count against you. */
export function signedBalance(kind: string, balance: number) {
  return kind === 'loan' || kind === 'card' ? -Math.abs(balance) : balance
}

/** Merchant names (as produced by core/categorize) counted as quick commerce / delivery. */
export const QUICK_COMMERCE = new Set(['Zepto', 'Blinkit', 'Swiggy Instamart', 'Zomato', 'Swiggy'])

/** "3 hours ago", "2 days ago". */
export function timeAgo(d: Date, now = new Date()) {
  const s = Math.round((d.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(s)
  if (abs < 60) return rtf.format(s, 'second')
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86_400), 'day')
}

export function dueLabel(daysLeft: number) {
  if (daysLeft <= 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'
  return `In ${daysLeft} days`
}

/** YYYY-MM helpers for the month selector. */
export function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export function monthRange(m: string): [string, string] {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`]
}

export function monthLabel(m: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))
}

/** Percent change, or null when the base is zero. */
export function pctChange(now: number, before: number) {
  return before > 0 ? ((now - before) / before) * 100 : null
}
