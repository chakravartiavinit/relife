import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { BookOpen, ChartColumn, ChevronDown, ChartPie, Flame, Footprints, Gift, GitCommitHorizontal, GitPullRequest, GraduationCap, HeartHandshake, Moon, PiggyBank, Shapes, Smile, Sparkles, Trophy, Waves, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import { getUser } from '@/core/user'
import { addDays, formatDay, localDate } from '@/core/time'
import { achievementBoard, recentXp, xpBreakdown, xpByDay, xpSummary } from '@/core/xp'
import { TITLES } from '@/domain/xp'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, Skeleton } from '@/ui/components/card'
import { DailyBars, ShareDonut } from '@/ui/components/charts'
import { TitleTrack } from '@/ui/components/xp'
import { AchievementsBoard } from '@/ui/components/achievements-board'
import { CharacterBanner } from '@/ui/components/hud'
import { AREA_ICON } from '@/ui/components/capsule-icon'
import { Consistency } from '@/ui/components/consistency'
import { LifeKpis } from '@/ui/components/life-kpis'
import { freezesHeld } from '@/core/quests'
import { ACHIEVEMENT_ICON, TIER_COLOR } from '@/ui/achievement-icons'
import { showUpStreak } from '@/ui/components/life-kpis'
import { PartyCard } from '@/ui/components/party/party-card'
import { partyCard } from '@/core/party'

export const metadata: Metadata = { title: 'Progress' }

const KIND = [
  { kind: 'consistency', label: 'Your plan', color: 'var(--pill)' },
  { kind: 'standard', label: 'Fixed measures', color: 'var(--good)' },
  { kind: 'bonus', label: 'Bonuses', color: 'var(--medal-gold)' },
  { kind: 'achievement', label: 'Achievements', color: 'var(--medal-sakura)' },
] as const

export default function ProgressPage() {
  return (
    <Suspense fallback={<ProgressSkeleton />}>
      <Progress />
    </Suspense>
  )
}

async function Progress() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const today = localDate(now, user.timezone)
  const from30 = addDays(today, -29)
  const [s, board, daily, mix, feed, streak, freezes, party] = await Promise.all([
    xpSummary(user, now), achievementBoard(user, now), xpByDay(user, from30, today), xpBreakdown(user, from30, today),
    recentXp(user, 60), showUpStreak(user, today), freezesHeld(user), partyCard(user, now),
  ])

  // Activity feed: last five days that earned XP, biggest awards first.
  const days = [...new Set(feed.map((e) => e.d))].slice(0, 3)
  const tierOf = new Map(board.map((a) => [a.key, a.tier]))

  return (
    <div className="flex flex-col gap-6">
      {/* On a phone Achievements come before Consistency (the most "do something next" content); on a laptop the order is the page's. */}
      <CharacterBanner
        s={s} name={user.name} heading={s.title} eyebrow={user.name}
        streak={streak} freezes={freezes} areas={user.profile.areas}
      >
        <div className="border-t border-divider/60 bg-surface/60 px-5 py-4 backdrop-blur-sm sm:px-6">
          <TitleTrack level={s.level} titles={TITLES} />
        </div>
      </CharacterBanner>

      <div className="max-lg:order-1"><PartyCard card={party} /></div>

      <section id="streak" aria-label="This week" className="scroll-mt-6 max-lg:order-1">
        <LifeKpis user={user} now={now} />
      </section>
      <div className="max-lg:order-3"><Consistency user={user} now={now} /></div>

      {/* Achievements full width; then XP over time beside where it comes from, both columns ending together. */}
      <div className="max-lg:order-2"><AchievementsBoard items={board.map((a) => ({ ...a, unlockedAt: a.unlockedAt ? a.unlockedAt.toISOString() : null, unlockedOn: a.unlockedAt ? localDate(a.unlockedAt, user.timezone) : null }))} /></div>

      <div className="grid gap-6 max-lg:order-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6 [&>*:last-child]:flex-1">

          <Card>
            <CardHeader title="XP per day" icon={<ChartColumn strokeWidth={2} />} color="var(--pill)" description={`Last 30 days · ${formatNumber([...daily.values()].reduce((a, b) => a + b, 0))} XP`} />
            <DailyBars data={fillDays(daily, from30, today, 0)} color="var(--pill)" unit="XP" height={170} label="XP per day, last 30 days" />
          </Card>

          <Card>
            <CardHeader title="Recent XP" icon={<Sparkles strokeWidth={2} />} color="var(--medal-gold)" description="What earned XP on your last active days" />
            {days.length ? (
              <ol className="flex flex-col gap-6">
                {days.map((d) => {
                  const items = feed.filter((e) => e.d === d)
                  const sum = items.reduce((a, e) => a + e.amount, 0)
                  return (
                    <li key={d}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : formatDay(d)}</span>
                        <span className="text-[12.5px] font-medium text-pill-ink tabular-nums">+{formatNumber(sum)} XP</span>
                      </div>
                      <ul className="flex flex-col">
                        {items.slice(0, 6).map((e) => {
                          const { icon: Icon, color } = xpIcon(e.source, e.area, tierOf)
                          return (
                            <li key={e.ref} className="flex h-12 items-center gap-3 text-[13.5px]">
                              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: `color-mix(in oklch, ${color} 78%, var(--ink))`, background: `color-mix(in oklch, ${color} 16%, transparent)` }}>
                                <Icon className="size-4" strokeWidth={2} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-ink">{e.reason}</span>
                              {!e.verified ? <span className="rounded-full px-1.5 text-[11px] text-ink-3 shadow-[inset_0_0_0_1px_var(--hairline)]">typed</span> : null}
                              <span className="w-12 text-end font-medium text-ink tabular-nums">+{formatNumber(e.amount)}</span>
                            </li>
                          )
                        })}
                        {items.length > 6 ? (
                          <li className="ps-11 pt-1 text-[12.5px] text-ink-3 tabular-nums">
                            {items.length - 6} more · +{formatNumber(items.slice(6).reduce((a, e) => a + e.amount, 0))} XP
                          </li>
                        ) : null}
                      </ul>
                    </li>
                  )
                })}
              </ol>
            ) : <p className="text-[13px] text-ink-3">Check off a routine and its XP shows up here.</p>}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 [&>*:last-child]:flex-1" aria-label="Scoring">
          <Card>
            <CardHeader title="Where XP comes from" icon={<ChartPie strokeWidth={2} />} color="var(--pill)" description="Last 30 days" />
            {mix.total ? (
              <ShareDonut
                label="XP by kind, last 30 days" unit="XP" totalLabel="XP, 30 days"
                segments={KIND.map((k) => ({ id: k.kind, name: k.label, color: k.color, value: mix.byKind.find((r) => r.kind === k.kind)?.n ?? 0 }))}
              />
            ) : <p className="text-[13px] text-ink-3">No XP in the last 30 days yet.</p>}
          </Card>

          <Card>
            <details className="group">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-heading font-semibold text-ink focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden"><BookOpen className="size-4 text-pill-ink" strokeWidth={2} aria-hidden />How XP works<ChevronDown className="ms-auto size-4 text-ink-3 transition-transform duration-150 group-open:rotate-180" strokeWidth={1.5} aria-hidden /></summary>
            <ul className="mt-3 flex flex-col gap-3 text-[13px] leading-relaxed text-ink-2">
              <Rule color="var(--pill)" title="Your plan">Up to 100 XP a day, split across what was due. More routines don’t raise the ceiling.</Rule>
              <Rule color="var(--good)" title="Fixed measures">7h sleep, 8k steps, a commit, a catch-up and more. The same for everyone.</Rule>
              <Rule color="var(--good)" title="Synced beats typed">Data that arrives by itself earns full XP. Typed-in data earns half, up to 40 a day.</Rule>
              <Rule color="var(--medal-gold)" title="Bonuses">Streaks multiply a day by up to ×1.5 at 30 days. Every area in a week: +50.</Rule>
              <Rule color="var(--medal-sakura)" title="Quests and chests">Two daily quests and one weekly quest, picked from your areas. Each one finished earns a chest, and every new level earns an epic one. Chests hold XP and sometimes a streak freeze.</Rule>
              <Rule color="var(--ink-3)" title="Fair play">New routines pay from the next day, and days older than yesterday are final.</Rule>
            </ul>
            </details>
          </Card>
        </aside>
      </div>
    </div>
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
  return { icon: SOURCE_ICON[source] ?? Sparkles, color: area === 'general' ? 'var(--medal-gold)' : CATEGORY[area].color }
}

function Rule({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span><span className="font-medium text-ink">{title}.</span> {children}</span>
    </li>
  )
}

function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[330px] rounded-xl" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[640px] rounded-lg" />
        <Skeleton className="h-[420px] rounded-lg" />
      </div>
    </div>
  )
}
