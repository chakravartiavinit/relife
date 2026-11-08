import { addDays } from '@/core/time'

// "The System": quests set from your own connector data, Solo Leveling style. The AI chooses what to
// train and words it; these pure rules keep it fair: targets stay within reach of your usual, ranks
// come from how big the stretch is, data decides when a quest clears, and a missed daily quest
// turns into a harder penalty quest the next day.

export type Op = 'gte' | 'lte'
export type Agg = 'sum' | 'avg'
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S'
export type SystemKind = 'daily' | 'penalty' | 'emergency'

/** A daily number the System can set quests on, with its recent baseline. */
export type Stat = {
  id: string; name: string; area: string; unit?: string | null
  direction: 'up' | 'down' | 'none'; agg: Agg
  /** Average a day over the 4 weeks before the last 7, and over the last 7. null when not logged. */
  usual: number | null; recent: number | null
  daysLogged: number
  /** Daily values over the last 4 weeks, oldest first. Ranks come from how often these met a target. */
  history?: number[]
}

export type QuestSpec = { statId: string; op: Op; target: number; days: number }

export const RANKS: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const RANK_XP: Record<Rank, number> = { E: 20, D: 35, C: 50, B: 75, A: 100, S: 150 }
const KIND_BONUS: Record<SystemKind, number> = { daily: 1, penalty: 1.25, emergency: 1.5 }

export const xpFor = (rank: Rank, kind: SystemKind) => Math.round(RANK_XP[rank] * KIND_BONUS[kind])

/**
 * Difficulty 1–5 from the share of recent daily quests you cleared: clear most and it rises, miss
 * and it eases off. Starts at 2.
 */
export function difficulty(recent: ('cleared' | 'failed')[]) {
  if (recent.length < 3) return 2
  const rate = recent.filter((s) => s === 'cleared').length / recent.length
  return rate >= 0.9 ? 5 : rate >= 0.75 ? 4 : rate >= 0.5 ? 3 : rate >= 0.3 ? 2 : 1
}

/** How much better than usual a quest at this difficulty asks for: 5% at 1, up to 35% at 5. */
export const stretch = (d: number) => [0.05, 0.1, 0.15, 0.25, 0.35][Math.min(5, Math.max(1, d)) - 1]

/** The usual a target is measured against, over a whole quest window. */
function base(s: Stat, days: number) {
  const u = s.usual ?? s.recent ?? 0
  return s.agg === 'sum' ? u * days : u
}

/**
 * Keep an AI-proposed target fair: at least your usual (for "more") or at most it (for "less"), and no
 * more than three stretches beyond it. Returns null when the stat doesn't exist or has no data.
 */
export function fairTarget(s: Stat | undefined, spec: QuestSpec, d: number): number | null {
  if (!s || s.daysLogged < 3) return null
  const b = base(s, spec.days)
  const max = 3 * stretch(d)
  let t = spec.target
  if (!Number.isFinite(t)) return null
  if (spec.op === 'gte') t = Math.min(Math.max(t, b), b * (1 + max) + 1)
  else t = Math.max(Math.min(t, b), b * (1 - max), 0)
  return round(t, s)
}

/** Whole numbers for counts and money, one decimal for small measures (sleep hours, mood). */
export function round(t: number, s: Pick<Stat, 'usual' | 'unit'>) {
  return Math.abs(s.usual ?? t) < 20 && !/^[A-Z]{3}$/.test(s.unit ?? '') ? Math.round(t * 10) / 10 : Math.round(t)
}

/**
 * Share of past windows (days, or runs of `days` for longer quests) that already met the target.
 * null without enough history. 1 means you'd clear it without trying.
 */
export function hitRate(s: Stat, spec: QuestSpec): number | null {
  const h = s.history ?? []
  if (h.length < 7) return null
  const n = Math.max(1, spec.days)
  const windows: number[] = []
  for (let i = 0; i + n <= h.length; i++) {
    const w = h.slice(i, i + n)
    windows.push(s.agg === 'sum' ? w.reduce((a, v) => a + v, 0) : w.reduce((a, v) => a + v, 0) / w.length)
  }
  const hits = windows.filter((v) => (spec.op === 'gte' ? v >= spec.target : v <= spec.target)).length
  return hits / windows.length
}

/**
 * Rank from how rarely your past days met the target: E if most did, S if almost none. Without
 * enough history, from the size of the stretch over your usual instead.
 */
export function rankFor(s: Stat, spec: QuestSpec): Rank {
  const rate = hitRate(s, spec)
  if (rate != null) return rate >= 0.8 ? 'E' : rate >= 0.6 ? 'D' : rate >= 0.45 ? 'C' : rate >= 0.3 ? 'B' : rate >= 0.15 ? 'A' : 'S'
  const b = base(s, spec.days)
  const r = b > 0 ? Math.abs(spec.target - b) / b : spec.op === 'gte' ? 1 : 0
  const steps = spec.op === 'lte' && spec.target === 0 ? 0.5 : r
  return steps < 0.05 ? 'E' : steps < 0.12 ? 'D' : steps < 0.2 ? 'C' : steps < 0.3 ? 'B' : steps < 0.45 ? 'A' : 'S'
}

/** The quest's value so far over its window: a total for counts and money, an average for mood or sleep. */
export function windowValue(days: Map<string, number>, from: string, to: string, agg: Agg): number | null {
  const vals: number[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) { const v = days.get(d); if (v != null) vals.push(v) }
  if (agg === 'sum') return vals.reduce((a, v) => a + v, 0)
  return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null
}

/**
 * Where a quest stands. "More" quests clear the moment they hit the target. "Less" quests can only
 * clear once the window is over (spending could still come in), but a total already over the limit
 * fails at once.
 */
export function judge(q: { op: Op; target: number; to: string; agg: Agg }, value: number | null, today: string): 'active' | 'cleared' | 'failed' {
  const over = today > q.to
  if (q.op === 'gte') return value != null && value >= q.target ? 'cleared' : over ? 'failed' : 'active'
  if (value != null && q.agg === 'sum' && value > q.target) return 'failed'
  if (!over) return 'active'
  return value != null && value <= q.target ? 'cleared' : 'failed'
}

/** The penalty for a missed daily quest: the same stat tomorrow, a stretch harder. */
export function penaltyFor(q: { op: Op; target: number; agg: Agg }, d: number): { op: Op; target: number } {
  const k = Math.max(0.15, stretch(d))
  return q.op === 'gte' ? { op: 'gte', target: q.target * (1 + k) } : { op: 'lte', target: q.target * (1 - 2 * k) }
}

/** Without an AI model: one quest per focus stat (or the stats furthest off your usual), a stretch better. */
export function fallbackQuests(stats: Stat[], focus: string[], d: number, count = 3): (QuestSpec & { title: string })[] {
  const usable = stats.filter((s) => s.direction !== 'none' && s.daysLogged >= 7 && (s.usual ?? 0) > 0)
  const slip = (s: Stat) => (s.recent != null && s.usual ? ((s.recent - s.usual) / s.usual) * (s.direction === 'up' ? -1 : 1) : 0)
  const pick = [...usable].sort((a, b) => Number(focus.includes(b.id)) - Number(focus.includes(a.id)) || slip(b) - slip(a)).slice(0, count)
  return pick.map((s) => {
    const op: Op = s.direction === 'up' ? 'gte' : 'lte'
    const target = round(op === 'gte' ? s.usual! * (1 + stretch(d)) : s.usual! * (1 - stretch(d)), s)
    return { statId: s.id, op, target, days: 1, title: `${op === 'gte' ? 'Reach' : 'Keep'} ${s.name.toLowerCase()} ${op === 'gte' ? 'of' : 'under'} ${target}${s.unit ? ` ${s.unit}` : ''}` }
  })
}

/**
 * A healthy balance: at most one spending-habit quest a day (ids starting "habit:"), and not the same habit
 * again the day after it was cleared. Everything else passes through in order.
 */
export function balanceHabits<T extends { statId: string }>(rows: T[], history: { statId: string; toDate: string; status: string }[], today: string): T[] {
  const yesterday = addDays(today, -1)
  const rested = new Set(history.filter((q) => q.toDate === yesterday && q.status === 'cleared').map((q) => q.statId))
  let habit = false
  return rows.filter((r) => {
    if (!r.statId.startsWith('habit:')) return true
    if (habit || rested.has(r.statId)) return false
    habit = true
    return true
  })
}
