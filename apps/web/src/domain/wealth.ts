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

/**
 * Month-to-date spending against a usual month: where spending would be today on a usual month, and where this
 * month lands if it keeps the same daily pace. `vsUsual` is the projected month against the usual one (0.2 = 20% more).
 */
export function monthPace(spent: number, day: number, daysInMonth: number, usualMonth: number | null, oneOff = 0) {
  // One-off big orders (a phone, a chair) happen once: count them as they are and project only the everyday rest.
  const projected = day > 0 ? oneOff + ((spent - oneOff) / day) * daysInMonth : 0
  const expected = usualMonth == null ? null : (usualMonth * day) / daysInMonth
  const vsUsual = usualMonth ? (projected - usualMonth) / usualMonth : null
  return { projected, expected, vsUsual }
}

/** Orders big enough to be one-offs: a quarter of a usual month or more (₹5,000+ without one). Their sum. */
export function oneOffs(orders: number[], usualMonth: number | null, floor = 5000) {
  const min = usualMonth ? Math.max(usualMonth * 0.25, 1) : floor
  return orders.filter((v) => v >= min).reduce((a, b) => a + b, 0)
}

/** Average of the full months before `month` that had any spending (up to `n` of them). Null with fewer than 2. */
export function usualMonth(byMonth: Map<string, number>, month: string, n = 6) {
  const prior = Array.from({ length: n }, (_, i) => byMonth.get(shiftMonth(month, -(i + 1)))).filter((v): v is number => !!v)
  return prior.length >= 2 ? prior.reduce((a, b) => a + b, 0) / prior.length : null
}

/** Things bought again and again: same first two words of the name, bought on at least `minDays` days, biggest spend first. */
export function repeatBuys(lines: { date: string; name: string; qty: number; spend: number }[], { minDays = 3, n = 5 } = {}) {
  const m = new Map<string, { name: string; days: Set<string>; qty: number; spend: number }>()
  for (const l of lines) {
    const name = l.name.split(/[|,(–—-]/)[0].trim().split(/\s+/).slice(0, 2).join(' ')
    const k = name.toLowerCase()
    if (!k) continue
    const r = m.get(k) ?? m.set(k, { name, days: new Set(), qty: 0, spend: 0 }).get(k)!
    r.days.add(l.date); r.qty += l.qty; r.spend += l.spend
  }
  return [...m.values()].filter((r) => r.days.size >= minDays).sort((a, b) => b.spend - a.spend).slice(0, n)
    .map((r) => ({ name: r.name, days: r.days.size, qty: r.qty, spend: r.spend }))
}
