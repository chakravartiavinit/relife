'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Loader2, Siren, Skull, Sparkles, X } from 'lucide-react'
import { summonSystem } from '@/app/actions'
import { formatValue } from '@/domain/patterns'
import type { Rank, SystemKind } from '@/domain/system'
import { Button } from './button'
import { Capsule } from './capsule'
import { cn } from '../cn'

export type SystemQuestItem = {
  id: string; kind: SystemKind; title: string; reason: string | null; rank: Rank; xp: number
  status: 'active' | 'cleared' | 'failed'; progress: number | null; target: number; op: 'gte' | 'lte'
  unit: string | null; toDate: string
}

export const RANK_COLOR: Record<Rank, string> = {
  E: 'var(--ink-3)', D: 'var(--good)', C: 'var(--sky)', B: 'var(--pill)', A: 'var(--medal-gold)', S: 'var(--medal-sakura)',
}

const GROUP: Record<SystemKind, { label: string; color: string; icon?: typeof Skull }> = {
  daily: { label: 'Daily quest', color: 'var(--pill-ink)' },
  penalty: { label: 'Penalty quest', color: 'var(--bad)', icon: Skull },
  emergency: { label: 'Emergency quest', color: 'var(--warn)', icon: Siren },
}

/** Time left until local midnight, ticking each minute. */
function useUntilMidnight() {
  const [left, setLeft] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const end = new Date(now); end.setHours(24, 0, 0, 0)
      const m = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000))
      setLeft(`${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`)
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])
  return left
}

/** The System's quests: daily ones set from your data, plus any penalty or emergency quest. */
export function SystemQuests({ quests, difficulty, hasData }: { quests: SystemQuestItem[]; difficulty: number; hasData: boolean }) {
  const left = useUntilMidnight()
  const kinds = (['emergency', 'penalty', 'daily'] as const).filter((k) => quests.some((q) => q.kind === k))
  const dailies = quests.filter((q) => q.kind === 'daily')
  const cleared = dailies.filter((q) => q.status === 'cleared').length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-pill-ink uppercase">[System]</p>
        <span className="flex items-center gap-2 text-[11.5px] text-ink-3 tabular-nums">
          <span title={`Difficulty ${difficulty} of 5: it rises as you clear quests and eases after misses.`} className="flex items-center gap-0.5" aria-label={`Difficulty ${difficulty} of 5`}>
            {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden className="h-2.5 w-1 rounded-full" style={{ background: i <= difficulty ? 'var(--pill)' : 'var(--hairline)' }} />)}
          </span>
          {left && dailies.some((q) => q.status === 'active') ? <span>· {left} left</span> : null}
        </span>
      </div>

      {quests.length ? (
        <div className="flex flex-col gap-4">
          {kinds.map((k) => {
            const g = GROUP[k]
            const items = quests.filter((q) => q.kind === k)
            return (
              <div key={k}>
                <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: g.color }}>
                  {g.icon ? <g.icon className="size-3.5" strokeWidth={2} aria-hidden /> : null}
                  {g.label}{k === 'daily' && dailies.length ? <span className="text-ink-3 tabular-nums">· {cleared}/{dailies.length}</span> : null}
                </h3>
                <ul className="flex flex-col">{items.map((q) => <QuestRow key={q.id} q={q} />)}</ul>
              </div>
            )
          })}
          {dailies.length && cleared === dailies.length ? (
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-good"><Sparkles className="size-3.5" strokeWidth={2} aria-hidden />All daily quests cleared. A reward box was granted.</p>
          ) : dailies.length ? (
            <p className="text-[12px] text-ink-3">Unfinished daily quests turn into penalty quests at midnight.</p>
          ) : null}
        </div>
      ) : <Summon hasData={hasData} />}
    </div>
  )
}

function QuestRow({ q }: { q: SystemQuestItem }) {
  const color = RANK_COLOR[q.rank]
  const value = q.progress ?? 0
  const over = q.op === 'lte' && value > q.target
  const done = q.status === 'cleared'
  const failed = q.status === 'failed'
  return (
    <li className="flex gap-3 py-2">
      <span
        aria-label={`Rank ${q.rank}`}
        className="grid size-8 shrink-0 place-items-center rounded-[9px] font-display text-[14px] font-extrabold"
        style={{ color: `color-mix(in oklch, ${color} 80%, var(--ink))`, background: `color-mix(in oklch, ${color} 16%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${color} 35%, transparent)` }}
      >
        {q.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={cn('text-[13.5px] leading-snug', done || failed ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink')}>{q.title}</span>
          {done ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-good"><Check className="size-3.5" strokeWidth={2.5} aria-hidden />+{q.xp} XP</span>
          ) : failed ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-bad"><X className="size-3.5" strokeWidth={2.5} aria-hidden />Failed</span>
          ) : (
            <span className="shrink-0 text-[11.5px] font-medium text-ink-3 tabular-nums">+{q.xp} XP</span>
          )}
        </span>
        {q.reason ? <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{q.reason}</span> : null}
        {!done && !failed ? (
          <span className="mt-1.5 flex items-center gap-2">
            <Capsule
              value={Math.min(value, q.target)} max={q.target || 1} size="sm"
              color={over ? 'var(--bad)' : q.op === 'lte' ? 'var(--good)' : color}
              label={`${q.title}: ${formatValue(value, q.unit)} of ${formatValue(q.target, q.unit)}`}
            />
            <span className={cn('shrink-0 text-[11.5px] tabular-nums', over ? 'text-bad' : 'text-ink-3')}>
              {formatValue(value, q.unit)} / {formatValue(q.target, q.unit)}{q.op === 'lte' ? ' max' : ''}
            </span>
          </span>
        ) : null}
      </span>
    </li>
  )
}

function Summon({ hasData }: { hasData: boolean }) {
  const [pending, start] = useTransition()
  if (!hasData) {
    return <p className="text-[12.5px] leading-relaxed text-ink-3">The System needs data to set quests. Connect an app or log mood, sleep or steps for a few days.</p>
  }
  return (
    <div className="flex flex-col items-start gap-2.5">
      <p className="text-[12.5px] text-ink-3">The System hasn’t issued today’s quests yet.</p>
      <Button size="sm" variant="primary" disabled={pending} onClick={() => start(async () => { await summonSystem() })}>
        {pending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden /> : <Sparkles className="size-3.5" strokeWidth={2} aria-hidden />}
        {pending ? 'The System is choosing…' : 'Receive today’s quests'}
      </Button>
    </div>
  )
}
