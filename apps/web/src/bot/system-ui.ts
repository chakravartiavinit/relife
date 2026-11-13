import { esc } from '@/core/notify'
import { formatDay } from '@/core/time'
import { formatValue } from '@/domain/patterns'
import type { QuestStatus, Rank, SystemKind } from '@/domain/system'
import { bar } from './ui'

// How the System talks in Telegram. Every System message has the same frame:
//   ⚔️ [SYSTEM] Daily quest has arrived
//   italic line in the System's voice
//
//   C  Keep total spending under ₹268          ← rank in a code badge
//   └ ▰▰▱▱▱▱▱▱ ₹80 / ₹268 max · +50 XP        ← progress and reward
//
//   ⏳ footer: the deadline or what happens next

export type QuestLike = {
  rank: Rank; title: string; xp: number; kind: SystemKind; status: QuestStatus
  progress: number | null; target: number; op: 'gte' | 'lte'; unit: string | null; toDate: string; fromDate: string
}

export const sysHead = (icon: string, title: string, sub?: string | null) =>
  `${icon} <b>[SYSTEM]</b> ${esc(title)}${sub ? `\n<i>${esc(sub)}</i>` : ''}`

/** One quest: rank badge and title, then progress and reward on a branch line. */
export function questBlock(q: QuestLike, opts: { progress?: boolean } = {}) {
  const title = q.status === 'cleared' ? `✅ <s>${esc(q.title)}</s>` : q.status === 'failed' ? `❌ <s>${esc(q.title)}</s>` : esc(q.title)
  const parts: string[] = []
  if (q.status === 'active' && opts.progress) {
    const v = q.progress ?? 0
    const over = q.op === 'lte' && v > q.target
    const ratio = q.op === 'gte' ? v / (q.target || 1) : over ? 1 : v / (q.target || 1)
    parts.push(q.progress == null ? 'No measurement yet' : `${bar(ratio, 8)} ${esc(formatValue(v, q.unit))} / ${esc(formatValue(q.target, q.unit))}${q.op === 'lte' ? ' max' : ''}${over ? ' ⚠️' : ''}`)
  }
  parts.push(q.status === 'cleared' ? `+${q.xp} XP earned` : q.status === 'failed' ? 'missed · no penalty' : q.status === 'unverified' ? 'No data · not counted as a miss' : q.status === 'cancelled' ? 'Retired · history unchanged' : `+${q.xp} XP`)
  if (q.toDate !== q.fromDate && q.status === 'active') parts.push(`until ${formatDay(q.toDate)}`)
  return `<code>${q.rank}</code> ${title}\n└ <i>${parts.join(' · ')}</i>`
}

/** A quest on one line, for /today: badge, title and where it stands. */
export function questLine(q: QuestLike) {
  const state = q.status === 'cleared' ? `✅ <s>${esc(q.title)}</s>` : q.status === 'failed' ? `❌ <s>${esc(q.title)}</s>` : esc(q.title)
  const prog = q.status === 'active' ? ` <i>· ${q.progress == null ? 'No measurement yet' : `${esc(formatValue(q.progress, q.unit))} / ${esc(formatValue(q.target, q.unit))}${q.op === 'lte' ? ' max' : ''}`}</i>` : q.status === 'unverified' ? ' <i>· No data</i>' : q.status === 'cancelled' ? ' <i>· Retired</i>' : ''
  return `<code>${q.rank}</code> ${state}${prog}`
}

export const blocks = (qs: QuestLike[], opts?: { progress?: boolean }) => qs.map((q) => questBlock(q, opts)).join('\n\n')

const LABEL: Record<SystemKind, string> = { emergency: 'Corrective quest', penalty: 'Retired penalty history', daily: '⚔️ Daily quests', recovery: 'Chosen recovery step' }

/** /quests: every open quest with progress, grouped, plus difficulty and time left. */
export function questLog(qs: QuestLike[], difficulty: number, minutesLeft: number) {
  const dots = '▰'.repeat(difficulty) + '▱'.repeat(5 - difficulty)
  const left = `${Math.floor(minutesLeft / 60)}h ${String(minutesLeft % 60).padStart(2, '0')}m left`
  const lines = [sysHead('📜', 'Quest log', `Difficulty ${dots} · ${left}`)]
  if (!qs.length) {
    lines.push('', '<i>No quests yet. The System issues them after midnight, once it has a few days of your data.</i>')
    return lines.join('\n')
  }
  for (const k of ['recovery', 'emergency', 'daily', 'penalty'] as const) {
    const group = qs.filter((q) => q.kind === k)
    if (!group.length) continue
    const done = group.filter((q) => q.status === 'cleared').length
    lines.push('', `<b>${LABEL[k]}</b>${k === 'daily' ? ` · ${done}/${group.length}` : ''}`, '', blocks(group, { progress: true }))
  }
  const dailies = qs.filter((q) => q.kind === 'daily')
  lines.push('', dailies.length && dailies.every((q) => q.status === 'cleared')
    ? '🎁 <i>All daily quests cleared. Reward box granted.</i>'
    : '<i>Missed daily quests offer recovery choices. No automatic penalties.</i>')
  return lines.join('\n')
}
