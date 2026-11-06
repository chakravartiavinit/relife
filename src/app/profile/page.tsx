import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Brain, CalendarDays, Code, Flame, HeartPulse, Trophy, Users, Wallet, Zap, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import { getUser } from '@/core/user'
import { addDays, formatDay, localDate } from '@/core/time'
import { achievementBoard, activeXpDays, recentXp, xpBreakdown, xpByDay, xpSummary } from '@/core/xp'
import { MEDALS, TITLES, xpForLevel } from '@/domain/xp'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '@/ui/tokens'
import { Card, CardHeader, IconChip, Skeleton } from '@/ui/components/card'
import { Capsule } from '@/ui/components/capsule'
import { DailyBars } from '@/ui/components/charts'
import { LevelRing, MEDAL_COLOR, MedalDisc, TitleTrack } from '@/ui/components/xp'
import { AchievementsBoard } from '@/ui/components/achievements-board'
import { showUpStreak } from '@/ui/components/life-kpis'

export const metadata: Metadata = { title: 'Profile' }

const AREA_ICON: Record<Category, LucideIcon> = { health: HeartPulse, mind: Brain, skills: Code, wealth: Wallet, relationships: Users }
const KIND = [
  { kind: 'consistency', label: 'Your plan', color: 'var(--pill)' },
  { kind: 'standard', label: 'Fixed measures', color: 'var(--good)' },
  { kind: 'bonus', label: 'Streak and balance bonuses', color: 'var(--medal-gold)' },
  { kind: 'achievement', label: 'Achievements', color: 'var(--medal-sakura)' },
] as const

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <Profile />
    </Suspense>
  )
}

async function Profile() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const today = localDate(now, user.timezone)
  const from30 = addDays(today, -29)
  const [s, board, daily, mix, feed, streak, activeDays] = await Promise.all([
    xpSummary(user, now), achievementBoard(user, now), xpByDay(user, from30, today), xpBreakdown(user, from30, today),
    recentXp(user, 60), showUpStreak(user, today), activeXpDays(user),
  ])
  const week = [...daily].filter(([d]) => d >= addDays(today, -6)).reduce((sum, [, n]) => sum + n, 0)
  const unlocked = board.filter((a) => a.unlockedAt).length
  const levelsToTitle = s.nextTitle ? s.nextTitle.level - s.level : 0

  // Activity feed: last five days that earned XP, biggest awards first.
  const days = [...new Set(feed.map((e) => e.d))].slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section aria-labelledby="hero-h" className="relative isolate overflow-hidden rounded-xl bg-surface p-6 shadow-2 sm:p-8">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(520px_260px_at_0%_0%,color-mix(in_oklch,var(--pill)_16%,transparent),transparent_70%),radial-gradient(520px_260px_at_100%_100%,color-mix(in_oklch,var(--sakura)_28%,transparent),transparent_70%)]" />
        <div className="grid items-center gap-8 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="rise" style={{ '--i': 0 } as React.CSSProperties}><LevelRing level={s.level} progress={s.progress} /></div>
          <div className="rise min-w-0" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="text-[12px] font-semibold tracking-[0.08em] text-pill-ink uppercase">{user.name}</div>
            <h1 id="hero-h" className="mt-1 font-display text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-[40px]">{s.title}</h1>
            <p className="mt-2 text-[14px] text-ink-2 tabular-nums">
              {formatNumber(s.total)} XP · <span className="text-ink">{formatNumber(s.next - s.total)} XP</span> to level {s.level + 1}
            </p>
            <Capsule value={s.total - s.floor} max={s.next - s.floor} color="var(--pill)" label={`Level ${s.level} progress`} className="mt-4 max-w-lg" />
            <div className="mt-2 flex max-w-lg justify-between text-[12px] text-ink-3 tabular-nums">
              <span>Lv {s.level} · {formatNumber(xpForLevel(s.level))}</span>
              <span>Lv {s.level + 1} · {formatNumber(s.next)}</span>
            </div>
            {s.nextTitle ? (
              <p className="mt-3 text-[13px] text-ink-3">Next title: <span className="font-medium text-ink">{s.nextTitle.title}</span> at level {s.nextTitle.level}, {levelsToTitle} level{levelsToTitle === 1 ? '' : 's'} away.</p>
            ) : <p className="mt-3 text-[13px] text-ink-3">You hold the highest title.</p>}
          </div>
          <dl className="rise grid grid-cols-2 gap-3 lg:w-[300px]" style={{ '--i': 2 } as React.CSSProperties}>
            <Stat icon={Flame} label="Streak" value={`${streak.current}d`} sub={`Best ${streak.best}d`} />
            <Stat icon={Zap} label="This week" value={formatNumber(week)} sub={`+${formatNumber(s.today)} today`} />
            <Stat icon={Trophy} label="Achievements" value={`${unlocked}/${board.length}`} sub="unlocked" />
            <Stat icon={CalendarDays} label="Active days" value={formatNumber(activeDays)} sub="with XP" />
          </dl>
        </div>
        <div className="rise mt-8 border-t border-divider pt-6" style={{ '--i': 3 } as React.CSSProperties}>
          <TitleTrack level={s.level} titles={TITLES} />
        </div>
      </section>

      {/* Areas */}
      <section aria-labelledby="areas-h">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="areas-h" className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Areas</h2>
          <p className="text-[12.5px] text-ink-3">Medals at area level {MEDALS.map((m) => m.level).join(', ')}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {s.areas.map((a) => {
            const next = MEDALS.find((m) => m.level > a.level)
            const Icon = AREA_ICON[a.area]
            const toNext = Math.max(0, Math.ceil((a.next - a.xp * 3) / 3))
            return (
              <li key={a.area} className="flex flex-col rounded-lg bg-surface p-4 shadow-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-ink"><IconChip color={CATEGORY[a.area].color}><Icon strokeWidth={2} /></IconChip>{CATEGORY[a.area].label}</span>
                  <MedalDisc medal={a.medal?.medal ?? null} size={30} label={a.medal ? `${a.medal.label} medal in ${CATEGORY[a.area].label}` : `No ${CATEGORY[a.area].label} medal yet`} />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-[28px] leading-none font-bold text-ink tabular-nums">Lv {a.level}</span>
                  <span className="text-[12px] text-ink-3 tabular-nums">{formatNumber(a.xp)} XP</span>
                </div>
                <Capsule value={a.progress} max={1} size="sm" color={CATEGORY[a.area].color} label={`${CATEGORY[a.area].label} level progress`} className="mt-3" />
                <div className="mt-1.5 text-[11.5px] text-ink-3 tabular-nums">{formatNumber(toNext)} XP to Lv {a.level + 1}</div>
                <div className="mt-4 flex items-center justify-between border-t border-divider pt-3">
                  <ul aria-label="Medals" className="flex gap-1">
                    {MEDALS.map((m) => {
                      const got = a.level >= m.level
                      return (
                        <li key={m.medal} title={`${m.label} at Lv ${m.level}${got ? ', earned' : ''}`} className="size-3.5 rounded-full"
                          style={got ? { background: MEDAL_COLOR[m.medal] } : { boxShadow: 'inset 0 0 0 1.5px var(--hairline)' }}>
                          <span className="sr-only">{m.label} {got ? 'earned' : 'not yet'}</span>
                        </li>
                      )
                    })}
                  </ul>
                  <span className="text-[11.5px] text-ink-3">{next ? `${next.label} at ${next.level}` : 'All medals'}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <AchievementsBoard items={board.map((a) => ({ ...a, unlockedAt: a.unlockedAt ? a.unlockedAt.toISOString() : null }))} />

      {/* XP over time and where it comes from */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="XP per day" description={`Last 30 days · ${formatNumber([...daily.values()].reduce((a, b) => a + b, 0))} XP`} />
          <DailyBars data={fillDays(daily, from30, today, 0)} color="var(--pill)" unit="XP" height={190} label="XP per day, last 30 days" />
        </Card>
        <Card>
          <CardHeader title="Where XP comes from" description="Last 30 days" />
          {mix.total ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="XP by kind">
                {KIND.map((k) => {
                  const n = mix.byKind.find((r) => r.kind === k.kind)?.n ?? 0
                  return n ? <span key={k.kind} style={{ width: `${(n / mix.total) * 100}%`, background: k.color }} className="h-full first:rounded-l-full last:rounded-r-full" /> : null
                })}
              </div>
              <ul className="mt-4 flex flex-col gap-2">
                {KIND.map((k) => {
                  const n = mix.byKind.find((r) => r.kind === k.kind)?.n ?? 0
                  return (
                    <li key={k.kind} className="flex items-center gap-2.5 text-[13px]">
                      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: k.color }} />
                      <span className="flex-1 text-ink-2">{k.label}</span>
                      <span className="font-medium text-ink tabular-nums">{formatNumber(n)}</span>
                      <span className="w-10 text-right text-ink-3 tabular-nums">{Math.round((n / mix.total) * 100)}%</span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-5 border-t border-divider pt-4">
                <h3 className="mb-2.5 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">By area</h3>
                <ul className="flex flex-col gap-2">
                  {s.areas.map((a) => {
                    const n = mix.byArea.find((r) => r.area === a.area)?.n ?? 0
                    const max = Math.max(1, ...mix.byArea.filter((r) => r.area !== 'general').map((r) => r.n))
                    return (
                      <li key={a.area} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2.5 text-[12.5px]">
                        <span className="text-ink-2">{CATEGORY[a.area].label}</span>
                        <span className="h-2 rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: CATEGORY[a.area].color }} /></span>
                        <span className="text-right text-ink tabular-nums">{formatNumber(n)}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </>
          ) : <p className="text-[13px] text-ink-3">No XP in the last 30 days yet.</p>}
        </Card>
      </div>

      {/* Activity and rules */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Recent XP" description="What earned XP on your last active days" />
          {days.length ? (
            <ol className="flex flex-col gap-5">
              {days.map((d) => {
                const items = feed.filter((e) => e.d === d)
                const sum = items.reduce((a, e) => a + e.amount, 0)
                return (
                  <li key={d}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold text-ink">{d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : formatDay(d)}</span>
                      <span className="text-[12.5px] font-medium text-pill-ink tabular-nums">+{formatNumber(sum)} XP</span>
                    </div>
                    <ul className="flex flex-col divide-y divide-divider rounded-md bg-surface-2/50 px-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
                      {items.slice(0, 6).map((e) => (
                        <li key={e.ref} className="flex items-center gap-2.5 py-2 text-[13px]">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: e.area === 'general' ? 'var(--medal-gold)' : CATEGORY[e.area].color }} />
                          <span className="min-w-0 flex-1 truncate text-ink-2">{e.reason}</span>
                          {!e.verified ? <span className="text-[11px] text-ink-3">typed</span> : null}
                          <span className="font-medium text-ink tabular-nums">+{formatNumber(e.amount)}</span>
                        </li>
                      ))}
                      {items.length > 6 ? (
                        <li className="py-2 text-[12.5px] text-ink-3 tabular-nums">
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
        <Card>
          <CardHeader title="How XP works" />
          <ul className="flex flex-col gap-3 text-[13px] leading-relaxed text-ink-2">
            <Rule color="var(--pill)" title="Your plan">Up to 100 XP a day, split across what was due. More routines don’t raise the ceiling.</Rule>
            <Rule color="var(--good)" title="Fixed measures">7h sleep, 8k steps, a commit, a catch-up and more. The same for everyone.</Rule>
            <Rule color="var(--good)" title="Synced beats typed">Data that arrives by itself earns full XP. Typed-in data earns half, up to 40 a day.</Rule>
            <Rule color="var(--medal-gold)" title="Bonuses">Streaks multiply a day by up to ×1.5 at 30 days. All five areas in a week: +50.</Rule>
            <Rule color="var(--ink-3)" title="Fair play">New routines pay from the next day, and days older than yesterday are final.</Rule>
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md bg-surface/70 p-3 shadow-[inset_0_0_0_1px_var(--hairline)] backdrop-blur-sm">
      <dt className="flex items-center gap-1.5 text-[12px] text-ink-3"><Icon className="size-3.5" strokeWidth={1.5} aria-hidden />{label}</dt>
      <dd className="mt-1.5 font-display text-[22px] leading-none font-bold text-ink tabular-nums">{value}</dd>
      <dd className="mt-1 text-[11.5px] text-ink-3 tabular-nums">{sub}</dd>
    </div>
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

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[330px] rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[190px] rounded-lg" />)}</div>
      <Skeleton className="h-[420px] rounded-lg" />
    </div>
  )
}
