import { ChartPie, ChevronRight, CircleDot, Flame, Footprints, Gift, GitCommitHorizontal, GitPullRequest, GraduationCap, HeartHandshake, History, Moon, PiggyBank, Shapes, Smile, Trophy, Waves, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import type { recentXp } from '@/core/xp'
import { addDays, formatDay } from '@/core/time'
import { formatNumber } from '@/domain/money'
import { ACHIEVEMENT_ICON, TIER_COLOR } from '../achievement-icons'
import { AREA_ICON } from './capsule-icon'
import { Fold } from './fold'
import { ProgressBlock } from './progress-block'
import { CATEGORY } from '../tokens'

// The three XP blocks of Progress: where it comes from (a stacked bar with its legend), how it is scored, and what
// earned it lately. Server components.

const KIND = [
  { kind: 'consistency', label: 'Your plan', color: 'var(--pill)' },
  { kind: 'standard', label: 'Fixed measures', color: 'var(--good)' },
  { kind: 'bonus', label: 'Bonuses', color: 'var(--medal-gold)' },
  { kind: 'achievement', label: 'Achievements', color: 'var(--medal-sakura)' },
] as const

/** Last 30 days of XP split by kind: one stacked bar, and the legend beside it with each kind's XP and share. */
export function XpMix({ mix }: { mix: { total: number; byKind: { kind: string; n: number }[] } }) {
  const parts = KIND.map((k) => ({ ...k, n: mix.byKind.find((r) => r.kind === k.kind)?.n ?? 0 }))
  const pct = (n: number) => Math.round((n / mix.total) * 100)
  return (
    <ProgressBlock title="Where XP comes from" icon={<ChartPie strokeWidth={2} />} color="var(--pill)" description={mix.total ? `Last 30 days · ${formatNumber(mix.total)} XP` : 'Last 30 days'} summary={mix.total ? `${formatNumber(mix.total)} XP in 30 days` : 'No XP yet'}>
      {mix.total ? (
        <>
          <div role="img" aria-label={`XP by kind, last 30 days: ${parts.map((p) => `${p.label} ${pct(p.n)}%`).join(', ')}`} className="flex h-3 gap-0.5 overflow-hidden rounded-xs">
            {parts.filter((p) => p.n > 0).map((p) => <span key={p.kind} className="h-full" style={{ width: `${(p.n / mix.total) * 100}%`, background: p.color }} />)}
          </div>
          <ul className="mt-4 flex flex-col gap-2.5">
            {parts.map((p) => (
              <li key={p.kind} className="flex items-center gap-2.5 text-body">
                <span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-ink">{p.label}</span>
                <span className="text-ink tabular-nums">{formatNumber(p.n)}</span>
                <span className="w-10 text-end text-small text-ink-3 tabular-nums">{pct(p.n)}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="text-small text-ink-3">No XP in the last 30 days yet.</p>}
    </ProgressBlock>
  )
}

function Rule({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span><span className="font-medium text-ink">{title}.</span> {children}</span>
    </li>
  )
}

/** The scoring rules, folded on every width (the rail's last card). */
export function HowXpWorks() {
  return (
    <Fold card title="How XP works" summary="Your plan, measures, bonuses, quests">
      <ul className="flex flex-col gap-3 text-small text-ink-2">
        <Rule color="var(--pill)" title="Your plan">Up to 100 XP a day, split across what was due. More routines don’t raise the ceiling.</Rule>
        <Rule color="var(--good)" title="Fixed measures">7h sleep, 8k steps, a commit, a catch-up and more. The same for everyone.</Rule>
        <Rule color="var(--good)" title="Synced beats typed">Data that arrives by itself earns full XP. Typed-in data earns half, up to 40 a day.</Rule>
        <Rule color="var(--medal-gold)" title="Bonuses">Streaks multiply a day by up to ×1.5 at 30 days. Every area in a week: +50.</Rule>
        <Rule color="var(--medal-sakura)" title="Quests and chests">Two daily quests and one weekly quest, picked from your areas. Each one finished earns a chest, and every new level earns an epic one. Chests hold XP and sometimes a streak freeze.</Rule>
        <Rule color="var(--ink-3)" title="Fair play">New routines pay from the next day, and days older than yesterday are final.</Rule>
      </ul>
    </Fold>
  )
}

// An icon for every kind of XP award, tinted by its area (gold for bonuses, the medal tier for achievements).
const SOURCE_ICON: Record<string, LucideIcon> = {
  sleep7: Moon, steps8k: Footprints, mood: Smile, meditate: Waves, commit: GitCommitHorizontal, pr: GitPullRequest,
  learn: GraduationCap, frugal: PiggyBank, catchup: HeartHandshake, streak: Flame, balance: Shapes, chest: Gift,
}
function xpIcon(source: string, area: Category | 'general', tierOf: Map<string, keyof typeof TIER_COLOR>): { icon: LucideIcon; color: string } {
  if (source.startsWith('ach:')) {
    const key = source.slice(4)
    return { icon: ACHIEVEMENT_ICON[key] ?? Trophy, color: TIER_COLOR[tierOf.get(key) ?? 'gold'] }
  }
  if (source === 'plan' && area !== 'general') return { icon: AREA_ICON[area], color: CATEGORY[area].color }
  return { icon: SOURCE_ICON[source] ?? CircleDot, color: area === 'general' ? 'var(--medal-gold)' : CATEGORY[area].color }
}

const SHOWN = 6
const dayName = (d: string, today: string) => (d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : formatDay(d))

/** What earned XP on the last active days: the newest day open, older days folded to their day and total. */
export function RecentXp({ feed, days, today, tierOf }: { feed: Awaited<ReturnType<typeof recentXp>>; days: string[]; today: string; tierOf: Map<string, keyof typeof TIER_COLOR> }) {
  const total = (d: string) => feed.filter((e) => e.d === d).reduce((a, e) => a + e.amount, 0)
  const rows = (d: string) => {
    const items = feed.filter((e) => e.d === d)
    return (
      <ul className="flex flex-col">
        {items.slice(0, SHOWN).map((e) => {
          const { icon: Icon, color } = xpIcon(e.source, e.area, tierOf)
          return (
            <li key={e.ref} className="flex h-10 items-center gap-3 text-small">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-sm" style={{ color: `color-mix(in oklch, ${color} 78%, var(--ink))`, background: `color-mix(in oklch, ${color} 16%, transparent)` }}>
                <Icon className="size-3.5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{e.reason}</span>
              {!e.verified ? <span className="rounded-full px-1.5 text-caption text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]">typed</span> : null}
              <span className="w-12 text-end font-medium text-ink tabular-nums">+{formatNumber(e.amount)}</span>
            </li>
          )
        })}
        {items.length > SHOWN ? <li className="ps-9 pt-1 text-caption text-ink-3 tabular-nums">{items.length - SHOWN} more · +{formatNumber(items.slice(SHOWN).reduce((a, e) => a + e.amount, 0))} XP</li> : null}
      </ul>
    )
  }
  return (
    <ProgressBlock
      title="Recent XP" icon={<History strokeWidth={1.5} />} color="var(--medal-gold)" description="What earned XP on your last active days"
      summary={days.length ? `${dayName(days[0], today)} +${formatNumber(total(days[0]))} XP` : 'Nothing yet'}
    >
      {days.length ? (
        <ol className="flex flex-col">
          {days.map((d, i) => i === 0 ? (
            <li key={d}>
              <div className="mb-1 flex items-baseline justify-between"><span className="text-small font-medium text-ink-3">{dayName(d, today)}</span><span className="text-small font-medium text-pill-ink tabular-nums">+{formatNumber(total(d))} XP</span></div>
              {rows(d)}
            </li>
          ) : (
            <li key={d} className="border-t border-divider">
              <details className="group/day">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-small select-none focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 text-ink-3 transition-transform duration-150 ease-out-quint group-open/day:rotate-90 motion-reduce:transition-none" />
                  <span className="flex-1 font-medium text-ink-2">{dayName(d, today)}</span>
                  <span className="font-medium text-pill-ink tabular-nums">+{formatNumber(total(d))} XP</span>
                </summary>
                <div className="pb-2">{rows(d)}</div>
              </details>
            </li>
          ))}
        </ol>
      ) : <p className="text-small text-ink-3">Check off a routine and its XP shows up here.</p>}
    </ProgressBlock>
  )
}
