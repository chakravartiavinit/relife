import { addDays } from '@/core/time'
import { questCandidates, type CoachStat, type QuestHistory } from './coach'
import type { Signal } from './patterns'
import { rankFor, xpFor, type Agg, type Op, type Rank } from './system'

export type RecoveryChoice = 'smaller' | 'rest' | 'priorities'

export type RecoveryPreview = {
  parentId: string
  statId: string
  title: string
  metric: string
  op: Op
  target: number
  unit: string | null
  aggregation: Agg
  fromDate: string
  toDate: string
  rank: Rank
  xp: number
  area: string
  baseline: number | null
}

export type RecoveryPayload = {
  localDate: string
  missedIds: string[]
  version: number
  preview: RecoveryPreview | null
  choice: RecoveryChoice | null
  questId: string | null
}

export type RecoveryView = {
  id: string
  version: number
  localDate: string
  missed: { id: string; title: string; progress: number | null; target: number; unit: string | null }[]
  preview: RecoveryPreview | null
  choice: RecoveryChoice | null
  questId: string | null
}

export type RecoveryMiss = {
  id: string; statId: string; statName: string; area: string; unit: string | null
  op: Op; agg: Agg; target: number; progress: number | null
}

type RecoveryInput = {
  missed: RecoveryMiss[]
  signals: Signal[]
  stats: CoachStat[]
  history: QuestHistory[]
  today: string
  focus: string[]
}

const titleFor = (name: string, target: number, unit: string | null, op: Op) =>
  `${name}: ${target}${unit ? ` ${unit}` : ''} or ${op === 'gte' ? 'more' : 'less'}`

/** One exact, already-easier candidate. No candidate means rest and priorities remain the safe options. */
export function smallerRecoveryPreview({ missed, signals, stats, history, today, focus }: RecoveryInput): RecoveryPreview | null {
  for (const parent of [...missed].sort((a, b) => a.id.localeCompare(b.id))) {
    const fromDate = parent.op === 'lte' ? addDays(today, 1) : today
    const active = history.filter((q) => q.status === 'active' && q.fromDate <= fromDate && q.toDate >= fromDate)
    if (active.length >= 3) continue
    const candidate = questCandidates(stats, focus, 1, history, today, fromDate).find((q) => q.statId === parent.statId)
    if (!candidate || candidate.op !== parent.op) continue
    if (candidate.op === 'gte' ? candidate.target >= parent.target : candidate.target <= parent.target) continue
    if (candidate.op === 'gte' && (signals.find((s) => s.id === candidate.statId)?.days.get(today) ?? -Infinity) >= candidate.target) continue
    const rank = rankFor(candidate.stat, candidate)
    return {
      parentId: parent.id, statId: candidate.statId, title: titleFor(candidate.stat.name, candidate.target, candidate.stat.unit ?? null, candidate.op),
      metric: candidate.stat.name, op: candidate.op, target: candidate.target, unit: candidate.stat.unit ?? null,
      aggregation: candidate.stat.agg, fromDate, toDate: fromDate, rank, xp: xpFor(rank, 'recovery'),
      area: candidate.stat.area, baseline: candidate.stat.usual,
    }
  }
  return null
}

export function recoveryView(id: string, payload: RecoveryPayload, missed: RecoveryView['missed']): RecoveryView {
  return { id, version: payload.version, localDate: payload.localDate, missed, preview: payload.preview, choice: payload.choice, questId: payload.questId }
}

export function samePreview(a: RecoveryPreview | null, b: RecoveryPreview | null) {
  return JSON.stringify(a) === JSON.stringify(b)
}
