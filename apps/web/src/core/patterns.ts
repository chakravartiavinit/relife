import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { describeChange, describeLink, findChanges, findLinks, type Signal } from '@/domain/patterns'
import { isSpend, trackerDays, transactionsBetween } from './metrics'
import { addDays, localDate, localHour } from './time'
import type { User } from './user'

// Every daily number ReLife knows, across all areas, turned into signals for src/domain/patterns.ts.
// New trackers (from any connector) join automatically, so a future Twitter connector's impressions
// would be paired with mood, sleep and spending with no extra code.

const WINDOW = 90
const MIN_LOGGED = 10

/** Days from the first day with data to today, missing ones as 0: no spending that day really is zero. */
function zeroFill(days: Map<string, number>, today: string) {
  if (!days.size) return days
  const out = new Map<string, number>()
  for (let d = [...days.keys()].sort()[0]; d <= today; d = addDays(d, 1)) out.set(d, days.get(d) ?? 0)
  return out
}

const add = (m: Map<string, number>, d: string, v: number) => m.set(d, (m.get(d) ?? 0) + v)

export async function loadSignals(user: User, now = new Date()): Promise<{ today: string; signals: Signal[] }> {
  const today = localDate(now, user.timezone)
  const from = addDays(today, -(WINDOW - 1))
  const [trackers, txns, checks] = await Promise.all([
    trackerDays(user, from, today),
    transactionsBetween(user, from, today),
    db.select({ d: schema.checks.localDate, n: sql<number>`count(*)::int` }).from(schema.checks)
      .innerJoin(schema.schedules, eq(schema.schedules.id, schema.checks.scheduleId))
      .where(and(eq(schema.schedules.userId, user.id), eq(schema.checks.status, 'done'), gte(schema.checks.localDate, from), lte(schema.checks.localDate, today)))
      .groupBy(schema.checks.localDate),
  ])

  const signals: Signal[] = trackers.filter((t) => t.days.size >= MIN_LOGGED).map(({ tracker: t, days }) => ({
    id: `tracker:${t.slug}`, name: t.name, area: t.category, group: `tracker:${t.slug}`,
    unit: t.unit, direction: t.kind === 'scale' || t.target != null ? t.direction : 'none', days,
    agg: t.aggregate === 'last' ? 'avg' as const : 'sum' as const,
  }))

  const spend = new Map<string, number>(), apps = new Map<string, number>(), late = new Map<string, number>()
  for (const t of txns.filter(isSpend)) {
    add(spend, t.localDate, -t.base)
    if ((t.meta as { platform?: string } | null)?.platform) {
      add(apps, t.localDate, -t.base)
      const h = localHour(t.at, user.timezone)
      if (h >= 22 || h < 4) add(late, t.localDate, 1)
    }
  }
  const money = { area: 'wealth', group: 'spend', unit: user.baseCurrency, direction: 'down' as const }
  if (spend.size >= MIN_LOGGED) signals.push({ id: 'spend', name: 'Spending', ...money, days: zeroFill(spend, today) })
  if (apps.size >= MIN_LOGGED) {
    signals.push({ id: 'spend:apps', name: 'Delivery app spending', ...money, days: zeroFill(apps, today) })
    signals.push({ id: 'orders:late', name: 'Late-night orders', ...money, unit: null, days: zeroFill(new Map([...apps.keys()].map((d) => [d, late.get(d) ?? 0])), today) })
  }
  if (checks.length >= MIN_LOGGED) {
    signals.push({ id: 'routines', name: 'Routines done', area: 'mind', group: 'routines', direction: 'up', days: zeroFill(new Map(checks.map((c) => [c.d, c.n])), today) })
  }
  return { today, signals }
}

/** Links and this week's changes, with plain sentences for the page and the coach. */
export async function loadPatterns(user: User, now = new Date()) {
  const { today, signals } = await loadSignals(user, now)
  return patternsFrom(signals, today)
}

export function patternsFrom(signals: Signal[], today: string) {
  const links = findLinks(signals)
  const changes = findChanges(signals, links, today)
  return {
    signals: signals.length,
    links: links.map((l) => ({ ...l, text: describeLink(l) })),
    changes: changes.map((c) => ({ ...c, text: describeChange(c) })),
  }
}

export type Patterns = ReturnType<typeof patternsFrom>
