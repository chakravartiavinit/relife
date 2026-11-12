import { addDays } from '@/core/time'
import type { Signal } from './patterns'
import { isSensitiveMeasure } from './goals'
import { balanceHabits, fairTarget, hitRate, judge, stretch, windowValue, type Agg, type QuestSpec, type QuestStatus, type Stat } from './system'

/** Complete-day observations only. These counts describe records, not connector coverage. */
export type CoachStat = Stat & {
  baselineDays: number; recentDays: number; lastObserved: string | null
  baselineFrom: string; baselineTo: string; recentFrom: string; recentTo: string
}
export type QuestCandidate = QuestSpec & { intent: 'growth' | 'recovery'; stat: CoachStat }
export type QuestHistory = { statId: string; fromDate: string; toDate: string; status: string }

export function coachStats(signals: Signal[], today: string): CoachStat[] {
  const baselineFrom = addDays(today, -35), baselineTo = addDays(today, -8)
  const recentFrom = addDays(today, -7), recentTo = addDays(today, -1)
  return signals.map((s) => {
    const observations = [...s.days].filter(([d, v]) => d >= baselineFrom && d <= recentTo && Number.isFinite(v) && v >= 0).sort(([a], [b]) => a.localeCompare(b))
    const baseline = observations.filter(([d]) => d <= baselineTo).map(([, v]) => v)
    const recent = observations.filter(([d]) => d >= recentFrom).map(([, v]) => v)
    const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
    // Never stitch missing dates into consecutive multi-day windows used for difficulty estimates.
    const history: number[] = []
    for (let d = recentTo; d >= addDays(today, -28); d = addDays(d, -1)) {
      const v = s.days.get(d)
      if (v == null || !Number.isFinite(v) || v < 0) break
      history.unshift(v)
    }
    return {
      id: s.id, name: s.name, area: s.area, unit: s.unit, direction: s.direction, agg: s.agg ?? 'sum',
      usual: mean(baseline), recent: mean(recent), daysLogged: observations.length, history,
      observations: observations.filter(([d]) => d >= addDays(today, -28)).map(([, v]) => v),
      baselineDays: baseline.length, recentDays: recent.length, lastObserved: observations.at(-1)?.[0] ?? null,
      baselineFrom, baselineTo, recentFrom, recentTo,
    }
  })
}

/** Sensitive measurements are context, never automatic "more/less" challenges. */
export function canCoach(s: Stat): boolean {
  const text = `${s.id} ${s.name}`.toLowerCase()
  if (s.direction === 'none' || isSensitiveMeasure(text)) return false
  // Money goals need discretionary context; aggregate spending can include essentials or planned purchases.
  if (s.area === 'wealth' && !s.id.startsWith('habit:')) return false
  // A generic multiplier is not a safe health prescription. Step counts remain modest activity goals.
  return s.area !== 'health' || (s.direction === 'up' && /\bsteps?\b/.test(text))
}

/**
 * Code owns every candidate target. The model may select candidates, not invent new measurements.
 * `prefer` (goal-linked stat IDs) only reorders candidates that already passed every check.
 */
export function questCandidates(stats: CoachStat[], focus: string[], d: number, history: QuestHistory[], today: string, startsOn = today, prefer: ReadonlySet<string> = new Set()): QuestCandidate[] {
  const active = new Set(history.filter((q) => q.status === 'active' && q.fromDate <= startsOn && q.toDate >= startsOn).map((q) => q.statId))
  const rested = new Set(history.filter((q) => q.status === 'cleared' && q.toDate === addDays(startsOn, -1)).map((q) => q.statId))
  const candidates = stats.flatMap((s): QuestCandidate[] => {
    if (!canCoach(s) || active.has(s.id) || s.baselineDays < 10 || s.recentDays < 4 || !s.lastObserved || s.lastObserved < addDays(today, -2)) return []
    if (s.usual == null || s.recent == null || s.usual <= 0 || s.recent < 0) return []
    if (s.id.startsWith('habit:') && s.recent <= s.usual) return []
    if (s.id.startsWith('habit:') && rested.has(s.id)) return []
    const recovery = s.direction === 'up' ? s.recent < s.usual : s.recent > s.usual
    const reference = recovery ? s.recent : s.usual
    if (reference <= 0) return []
    const spec: QuestSpec = { statId: s.id, op: s.direction === 'up' ? 'gte' : 'lte', days: 1, target: reference * (s.direction === 'up' ? 1 + stretch(Math.min(d, 3)) : 1 - stretch(Math.min(d, 3))) }
    if (s.observations?.length && s.observations.every(Number.isInteger)) spec.target = spec.op === 'gte' ? Math.ceil(spec.target) : Math.floor(spec.target)
    const target = fairTarget(s, spec, Math.min(d, 3))
    if (target == null || (spec.op === 'gte' ? target <= reference : target >= reference)) return []
    const candidate = { ...spec, target, intent: recovery ? 'recovery' as const : 'growth' as const, stat: s }
    if ((hitRate(s, candidate) ?? 0) >= 0.9) return []
    return [candidate]
  })
  const slip = (s: CoachStat) => ((s.recent! - s.usual!) / s.usual!) * (s.direction === 'up' ? -1 : 1)
  candidates.sort((a, b) => Number(prefer.has(b.statId)) - Number(prefer.has(a.statId)) || Number(focus.includes(b.statId)) - Number(focus.includes(a.statId)) || slip(b.stat) - slip(a.stat))
  return candidates.slice(0, 24)
}

/** One policy for AI and fallback: dedupe, cap load, avoid active conflicts and repeated habit pressure. */
export function selectQuests(candidates: QuestCandidate[], ids: string[], history: QuestHistory[], today: string, limit = 3, prefer: ReadonlySet<string> = new Set()): QuestCandidate[] {
  const byId = new Map(candidates.map((c) => [c.statId, c]))
  const seen = new Set<string>()
  // Stable: goal-linked picks first, so the cap trims other picks first.
  const ordered = [...ids.filter((id) => prefer.has(id)), ...ids.filter((id) => !prefer.has(id))]
  const chosen = ordered.flatMap((id) => {
    const c = byId.get(id)
    if (!c || seen.has(id)) return []
    seen.add(id)
    return [c]
  })
  const active = history.filter((q) => q.status === 'active' && q.fromDate <= today && q.toDate >= today).length
  return balanceHabits(chosen, history, today).slice(0, Math.min(Math.max(0, 3 - active), Math.max(0, limit)))
}

/** Do not clear a reduction from absent observations, or count future-window data as progress. */
export function questProgress(q: { fromDate: string; toDate: string; agg: Agg; op: 'gte' | 'lte'; target: number }, signal: Signal | undefined, today: string) {
  if (q.fromDate > today) return { value: null, status: 'active' as const }
  const end = q.toDate < today ? q.toDate : today
  let value = signal ? windowValue(signal.days, q.fromDate, end, q.agg) : null
  if ((q.op === 'lte' || q.agg === 'avg') && today > q.toDate) {
    for (let d = q.fromDate; d <= q.toDate; d = addDays(d, 1)) {
      const v = signal?.days.get(d)
      if (v == null || !Number.isFinite(v)) { value = null; break }
    }
  }
  return { value, status: judge({ ...q, to: q.toDate }, value, today) }
}

/**
 * Late evidence for a quest already judged: a recorded miss or an unknown result that the data now meets becomes
 * cleared. Nothing is downgraded, so a late import never creates a new miss or a new recovery pause.
 */
export function lateClear(q: Parameters<typeof questProgress>[0] & { status: QuestStatus }, signal: Signal | undefined, today: string) {
  if (q.status !== 'failed' && q.status !== 'unverified') return null
  const next = questProgress(q, signal, today)
  return next.status === 'cleared' ? next : null
}

/** A same-day spending spike asks for context; it must never automatically prescribe deprivation. */
export function spendingSpike(signals: Signal[], today: string): { signal: Signal; current: number; usual: number; n: number } | null {
  for (const signal of signals.filter((s) => s.id === 'spend:apps' || s.id === 'spend').sort((a, b) => Number(b.id === 'spend:apps') - Number(a.id === 'spend:apps'))) {
    const current = signal.days.get(today)
    const xs = [...signal.days].filter(([d, v]) => d >= addDays(today, -28) && d < today && Number.isFinite(v) && v >= 0).map(([, v]) => v)
    if (current == null || !Number.isFinite(current) || xs.length < 14) continue
    const usual = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, v) => a + (v - usual) ** 2, 0) / xs.length)
    if (usual > 0 && current >= usual * 2 && current > usual + 2 * sd) return { signal, current, usual, n: xs.length }
  }
  return null
}
