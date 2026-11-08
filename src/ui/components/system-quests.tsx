'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Bike, BookOpen, Check, CircleDot, Cookie, CupSoda, Droplet, Footprints, GitCommitHorizontal, GitPullRequest, GraduationCap, Laptop, Loader2,
  MessageSquareCode, Moon, MoonStar, Puzzle, ShoppingBag, Siren, Skull, Smartphone, Smile, Sparkles, Target, Tv, Wallet, X, Zap, type LucideIcon,
} from 'lucide-react'
import { CATEGORY } from '../tokens'
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
  /** What it measures (github.commits, spend:apps, habit:item:diet coke…) and its life area, for the icon and colour. */
  statId?: string; area?: string
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
            const items = quests.filter((q) => q.kind === k).sort((a, b) => ORDER[a.status] - ORDER[b.status])
            return (
              <div key={k}>
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: g.color }}>
                  {g.icon ? <g.icon className="size-3.5" strokeWidth={2} aria-hidden /> : null}
                  {g.label}{k === 'daily' && dailies.length ? <span className="text-ink-3 tabular-nums">· {cleared}/{dailies.length}</span> : null}
                </h3>
                <ul className="flex flex-col gap-2">{items.map((q) => <QuestRow key={q.id} q={q} />)}</ul>
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

const ORDER = { active: 0, cleared: 1, failed: 2 } as const

/** An icon for what a quest measures; the life area's icon when nothing more specific fits. */
const STAT_ICON: [RegExp, LucideIcon][] = [
  [/github\.commits/, GitCommitHorizontal], [/github\.prs/, GitPullRequest], [/github\.reviews/, MessageSquareCode], [/github\.issues/, CircleDot],
  [/spend:apps|delivery/, Bike], [/orders:late/, MoonStar], [/^spend|money|wealth/, Wallet],
  [/habit:.*(drink|coke|cola|pepsi|soda|red bull|juice)/, CupSoda], [/habit:.*(snack|sweet|chocolate|chips|cookie)/, Cookie], [/habit:/, ShoppingBag],
  [/sleep/, Moon], [/steps|walk/, Footprints], [/water/, Droplet], [/mood/, Smile], [/energy/, Zap],
  [/learning|course/, GraduationCap], [/read|book/, BookOpen], [/screen\.social/, Smartphone], [/screen\.entertainment/, Tv], [/screen\.work|deep/, Laptop],
  [/cp\.|codeforces|solved/, Puzzle],
]
const iconFor = (q: SystemQuestItem) => STAT_ICON.find(([re]) => re.test(`${q.statId ?? ''} ${q.title}`.toLowerCase()))?.[1] ?? Target
const RANK_HINT: Record<Rank, string> = { E: 'easy', D: 'light', C: 'steady', B: 'a stretch', A: 'hard', S: 'very hard' }

/**
 * One quest: an icon for what it measures in its area's colour with the rank on its corner, the title and its state
 * (XP to win, cleared, failed), why it was set, and progress toward the target. Resolved quests step back.
 */
function QuestRow({ q }: { q: SystemQuestItem }) {
  const area = q.area && q.area in CATEGORY ? CATEGORY[q.area as keyof typeof CATEGORY].color : 'var(--pill)'
  const rank = RANK_COLOR[q.rank]
  const Icon = iconFor(q)
  const value = q.progress ?? 0
  const over = q.op === 'lte' && value > q.target
  const done = q.status === 'cleared'
  const failed = q.status === 'failed'
  return (
    <li
      className={cn('flex gap-3 rounded-[14px] p-3 transition-[background-color] duration-150', !done && !failed && 'bg-ink/[0.025] dark:bg-white/[0.035]')}
      style={done ? { background: 'color-mix(in oklch, var(--good) 7%, transparent)' } : failed ? { background: 'color-mix(in oklch, var(--bad) 5%, transparent)' } : undefined}
    >
      <span className="relative shrink-0">
        <span
          aria-hidden
          className={cn('grid size-9 place-items-center rounded-[10px]', (done || failed) && 'opacity-60')}
          style={{ color: `color-mix(in oklch, ${area} 80%, var(--ink))`, background: `color-mix(in oklch, ${area} 15%, transparent)` }}
        >
          <Icon className="size-[18px]" strokeWidth={2} />
        </span>
        <span
          title={`Rank ${q.rank}: ${RANK_HINT[q.rank]}`}
          aria-label={`Rank ${q.rank}, ${RANK_HINT[q.rank]}`}
          className="absolute -right-1.5 -bottom-1.5 grid size-[18px] place-items-center rounded-full bg-surface font-display text-[10px] font-extrabold shadow-1"
          style={{ color: `color-mix(in oklch, ${rank} 85%, var(--ink))`, boxShadow: `0 0 0 1.5px color-mix(in oklch, ${rank} 45%, transparent)` }}
        >
          {q.rank}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-[13.5px] leading-snug font-medium', done ? 'text-ink-2' : failed ? 'text-ink-3' : 'text-ink')}>{q.title}</p>
          {done ? (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-good/12 px-2 text-[11.5px] font-semibold text-good tabular-nums"><Check className="size-3.5" strokeWidth={2.5} aria-hidden />+{q.xp} XP</span>
          ) : failed ? (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-bad/10 px-2 text-[11.5px] font-semibold text-bad"><X className="size-3.5" strokeWidth={2.5} aria-hidden />Failed</span>
          ) : (
            <span className="inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11.5px] font-semibold tabular-nums" style={{ color: 'color-mix(in oklch, var(--medal-gold) 80%, var(--ink))', background: 'color-mix(in oklch, var(--medal-gold) 12%, transparent)' }}>+{q.xp} XP</span>
          )}
        </div>
        {q.reason ? (
          <p title={q.reason} className={cn('mt-1 text-[12.5px] leading-relaxed text-ink-3 text-pretty', done || failed ? 'line-clamp-1' : 'line-clamp-2')}>{q.reason}</p>
        ) : null}
        {!done && !failed ? (
          <div className="mt-2 flex items-center gap-2.5">
            <Capsule
              value={Math.min(value, q.target)} max={q.target || 1} size="sm"
              color={over ? 'var(--bad)' : q.op === 'lte' ? 'var(--good)' : area}
              label={`${q.title}: ${formatValue(value, q.unit)} of ${formatValue(q.target, q.unit)}`}
            />
            <span className={cn('shrink-0 text-[11.5px] font-medium tabular-nums', over ? 'text-bad' : 'text-ink-2')}>
              {formatValue(value, q.unit)} <span className="font-normal text-ink-3">of {formatValue(q.target, q.unit)}{q.op === 'lte' ? ' max' : ''}</span>
            </span>
          </div>
        ) : null}
      </div>
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
