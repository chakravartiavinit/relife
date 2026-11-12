// Capture's pure rules: which time of day it is, which manual logs usually happen now, and how a typed quick log
// reads back before it is saved. No DB, no React (the data comes from src/core/capture.ts).
import type { Category } from '@/db/schema'
import { formatMoney, formatNumber } from './money'
import { LAST_VALUE, type QuickLog } from './quicklog'

export type Bucket = 'morning' | 'afternoon' | 'evening' | 'night'

/** Morning 4–12, afternoon 12–17, evening 17–22, night 22–4. `hour` is the local hour (fractions are fine). */
export function bucketOf(hour: number): Bucket {
  const h = ((hour % 24) + 24) % 24
  if (h >= 4 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 22) return 'evening'
  return 'night'
}

/** One typed-in value on one local day, with the local hour it was last written. */
export type ManualLog = { slug: string; name: string; unit: string | null; area: Category; day: string; hour: number; value: number }
export type Frequent = { slug: string; name: string; unit: string | null; area: Category; typical: number }

export const FREQUENT_MIN_DAYS = 4
export const FREQUENT_BUCKET_SHARE = 0.5
export const FREQUENT_MAX = 6

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * The manual logs that usually happen around now. `history` is the last 28 days of manual entries (one per
 * tracker per day). A tracker is frequent when it was logged on at least 4 of them, and shown now when at least
 * half of those days fall in the current time-of-day bucket. `typical` is the median value. Most-logged first,
 * at most 6. `exclude` leaves out trackers shown elsewhere (quantity goals, mood).
 */
export function rankCaptureSuggestions(history: ManualLog[], nowHour: number, exclude: ReadonlySet<string> = new Set()): Frequent[] {
  const now = bucketOf(nowHour)
  const by = new Map<string, ManualLog[]>()
  for (const l of history) {
    if (exclude.has(l.slug)) continue
    const rows = by.get(l.slug)
    if (rows) rows.push(l); else by.set(l.slug, [l])
  }
  const out: (Frequent & { days: number })[] = []
  for (const [slug, rows] of by) {
    const days = new Map<string, ManualLog>()
    for (const r of rows) days.set(r.day, r) // one row per day; a repeat keeps the later one
    if (days.size < FREQUENT_MIN_DAYS) continue
    const logs = [...days.values()]
    if (logs.filter((r) => bucketOf(r.hour) === now).length / logs.length < FREQUENT_BUCKET_SHARE) continue
    const first = logs[0]
    out.push({ slug, name: first.name, unit: first.unit, area: first.area, typical: median(logs.map((r) => r.value)), days: logs.length })
  }
  return out.sort((a, b) => b.days - a.days || a.slug.localeCompare(b.slug)).slice(0, FREQUENT_MAX).map(({ days: _days, ...f }) => f)
}

/** "1.5 L" for big ml amounts, "250 ml", "12 pages", "30 min". */
export function amountText(value: number, unit: string | null | undefined): string {
  if (unit === 'ml' && Math.abs(value) >= 1000) return `${formatNumber(value / 1000, 2)} L`
  const n = formatNumber(value, value % 1 ? 1 : 0)
  return unit ? `${n} ${unit}` : n
}

type PreviewTracker = { slug: string; name: string; unit: string | null }
type PreviewGoal = { slug: string; value: number; target: number; unit: string }

/**
 * What a typed quick log will do, in words, before it is saved ("Log Water +250 ml", "1.5 of 3 L after this").
 * XP is left out: the exact amount depends on server rules, so it shows in the result toast instead.
 */
export function previewQuickLog(q: QuickLog, trackers: PreviewTracker[], goals: PreviewGoal[]): { title: string; sub: string; slug?: string } {
  if (q.type === 'spend') return { title: `Spend ${formatMoney(q.amount, q.currency)} · ${q.note}`, sub: 'Adds a manual expense' }
  const t = trackers.find((x) => x.slug === q.slug)
  if (!t) return { title: `Log ${q.slug.replace(/[-.]/g, ' ')} ${formatNumber(q.value, q.value % 1 ? 1 : 0)}`, sub: 'New tracker, made the first time you log it', slug: q.slug }
  const unit = t.unit ?? ''
  if (LAST_VALUE.has(q.slug)) return { title: `Set ${t.name} to ${formatNumber(q.value, q.value % 1 ? 1 : 0)}${unit ? ` ${unit}` : ''}`, sub: 'Replaces today’s value', slug: q.slug }
  const g = goals.find((x) => x.slug === q.slug)
  const sign = q.value < 0 ? '−' : '+'
  const title = `Log ${t.name} ${sign}${amountText(Math.abs(q.value), t.unit)}`
  return { title, sub: g ? `${amountText(Math.max(0, g.value + q.value), g.unit)} of ${amountText(g.target, g.unit)} after this` : 'Adds to today', slug: q.slug }
}

/** What Capture needs to open: served by `GET /api/capture` (built in src/core/capture.ts). */
export type CapturePayload = {
  now: string
  bucket: Bucket
  /** The user's base currency: the Spent row's symbol and the code added to a typed amount when it is not INR. */
  currency: string
  /** Routines due or overdue in this time of day, in the order to show them. */
  due: { scheduleId: string; occurrence: string; name: string; time: string; area: Category; kind: string; status: 'pending' | 'missed'; xp?: number }[]
  /** Quantity goals (water): one tap adds `step`. */
  goals: { scheduleId: string; slug: string; name: string; value: number; target: number; unit: string; step: number; area: Category }[]
  frequent: Frequent[]
  /** Every tracker, so a typed log can show its name and unit before saving. */
  trackers: { slug: string; name: string; unit: string | null }[]
  moodToday: number | null
  /** Manual spends the user repeats, most often first: one tap logs the usual amount again. */
  spend: { note: string; amount: number; currency: string }[]
}
