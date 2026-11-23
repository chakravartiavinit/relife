import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { addDays, localDate } from '@/core/time'
import { achievementBoard, recentXp, xpBreakdown, xpByDay, xpSummary } from '@/core/xp'
import { freezesHeld } from '@/core/quests'
import { partyCard } from '@/core/party'
import { fillDays } from '@/domain/series'
import { TITLES } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { paceWhen, paceWords } from '@/domain/progress-words'
import { Skeleton, Card } from '@/ui/components/card'
import { DailyBars } from '@/ui/components/charts'
import { TitleTrack } from '@/ui/components/xp'
import { AchievementsBoard } from '@/ui/components/achievements-board'
import { CloseToUnlocking } from '@/ui/components/close-to-unlocking'
import { CharacterSheet } from '@/ui/components/hud'
import { ConsistencyByArea, consistencySummary, loadConsistency } from '@/ui/components/consistency'
import { Fold } from '@/ui/components/fold'
import { InsightLine } from '@/ui/components/insight-line'
import { LifeKpis, showUpStreak } from '@/ui/components/life-kpis'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { PartyCard } from '@/ui/components/party/party-card'
import { AchievementsGlance, ConsistencyGlance, XpGlance } from '@/ui/components/progress-glance'
import { HowXpWorks, RecentXp, recentXpSummary, XpMix, xpMixSummary } from '@/ui/components/xp-blocks'

export const metadata: Metadata = { title: 'Progress' }

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
  const [s, board, daily, mix, feed, streak, freezes, consistency] = await Promise.all([
    xpSummary(user, now), achievementBoard(user, now), xpByDay(user, from30, today), xpBreakdown(user, from30, today),
    recentXp(user, 60), showUpStreak(user, today), freezesHeld(user), loadConsistency(user, now),
  ])

  // Activity feed: the last three days that earned XP, biggest awards first; only the newest is open.
  const days = [...new Set(feed.map((e) => e.d))].slice(0, 3)
  const tierOf = new Map(board.map((a) => [a.key, a.tier]))
  const items = board.map((a) => ({ ...a, unlockedAt: a.unlockedAt ? a.unlockedAt.toISOString() : null, unlockedOn: a.unlockedAt ? localDate(a.unlockedAt, user.timezone) : null }))
  const xpDays = fillDays(daily, from30, today, 0)
  const xp30 = xpDays.reduce((n, p) => n + (p.value ?? 0), 0)
  const perDay = xp30 / xpDays.length
  const unlocked = items.filter((a) => a.unlockedAt)

  // The opening line, and the next level as the first unlock.
  const toGo = s.next - s.total
  const nextLevel = s.level + 1
  const title = s.nextTitle && s.nextTitle.level === nextLevel ? s.nextTitle.title : null
  const pace = paceWords(toGo, perDay)
  const level = { level: nextLevel, toGo, progress: s.progress, title, when: paceWhen(toGo, perDay), pace }

  // The fold bodies are wide: each sits in the one card of folds below the glance cards. `id`s are what the glance links open.
  const row = 'border-b border-divider last:border-b-0'
  return (
    <PageGrid>
      <GridItem>
        <InsightLine
          why={<>
            Your level counts every XP you have earned, {formatNumber(s.total)} so far; today so far is +{formatNumber(s.today)}.
            {pace ? <> At about {formatNumber(Math.round(perDay))} XP a day over the last 30 days, level {nextLevel} is {pace} away.</> : null}
            {title ? <> It brings the {title} title.</> : s.nextTitle ? <> The next title, {s.nextTitle.title}, comes at level {s.nextTitle.level}.</> : null}
          </>}
        >
          Level {s.level}, and {formatNumber(toGo)} XP from level {nextLevel}{title ? <> and the {title} title</> : null}.
        </InsightLine>
      </GridItem>

      <GridItem span={{ base: 12, lg: 8 }}>
        <CharacterSheet s={s} name={user.name} streak={streak} freezes={freezes} areas={user.profile.areas} today={today}>
          <TitleTrack level={s.level} titles={TITLES} />
        </CharacterSheet>
      </GridItem>
      <GridItem span={{ base: 12, lg: 4 }}><CloseToUnlocking items={items} level={level} /></GridItem>

      <GridItem span={{ base: 4, lg: 4 }}><AchievementsGlance items={items} today={today} yesterday={addDays(today, -1)} /></GridItem>
      <GridItem span={{ base: 4, lg: 4 }}><ConsistencyGlance data={consistency} /></GridItem>
      <GridItem span={{ base: 8, lg: 4 }}><XpGlance days={xpDays.map((p) => ({ d: p.date, n: p.value ?? 0 }))} /></GridItem>

      {/* Its own read, so a slow or failing party never holds up the rest of the page. No wrapper when nothing shows. */}
      <Suspense fallback={<GridItem><Skeleton className="h-[200px] rounded-lg" /></GridItem>}>
        <PartySlot />
      </Suspense>

      <GridItem>
        <Card as="section" aria-label="More on your progress" className="px-5 py-1">
          <div id="achievements-fold" className={row}>
            <Fold title="Achievements" summary={`${unlocked.length} of ${items.length} unlocked · ${formatNumber(unlocked.reduce((n, a) => n + a.xp, 0))} XP`}>
              <div className="pb-4 pt-2"><AchievementsBoard items={items} /></div>
            </Fold>
          </div>
          <div id="consistency-fold" className={row}>
            <Fold title="Consistency by area" summary={consistencySummary(consistency)}>
              <div className="pb-4 pt-2"><ConsistencyByArea data={consistency} /></div>
            </Fold>
          </div>
          <div id="xp-fold" className={row}>
            <Fold title="XP per day" summary={`${formatNumber(xp30)} XP in 30 days`}>
              <div className="pb-4 pt-2"><DailyBars data={xpDays} color="var(--pill)" unit="XP" height={260} label="XP per day, last 30 days" /></div>
            </Fold>
          </div>
          <div className={row}>
            <Fold title="Recent XP" summary={recentXpSummary(feed, days, today)}>
              <div className="pb-4 pt-2"><RecentXp feed={feed} days={days} today={today} tierOf={tierOf} /></div>
            </Fold>
          </div>
          <div className={row}>
            <Fold title="Where XP comes from" summary={xpMixSummary(mix)}>
              <div className="pb-4 pt-2"><XpMix mix={mix} /></div>
            </Fold>
          </div>
          <div className={row}>
            <Fold title="This week, area by area" summary="The last 7 days against the 7 before">
              <div className="pb-4 pt-2"><LifeKpis user={user} now={now} bare /></div>
            </Fold>
          </div>
          <div className={row}>
            <Fold title="How XP works" summary="Your plan, measures, bonuses, quests">
              <div className="pb-4 pt-2"><HowXpWorks /></div>
            </Fold>
          </div>
        </Card>
      </GridItem>
    </PageGrid>
  )
}

async function PartySlot() {
  await connection()
  const user = await getUser()
  const card = await partyCard(user, new Date())
  // A server with one person and no party has nothing to show: no card, and no gap where it would be.
  if (!card.parties.length && !card.invites.length && !card.people.length) return null
  return <GridItem><PartyCard card={card} /></GridItem>
}

function ProgressSkeleton() {
  return (
    <PageGrid aria-busy>
      <GridItem><Skeleton className="h-6 w-2/3 max-w-[480px]" /></GridItem>
      <GridItem span={{ base: 12, lg: 8 }}><Skeleton className="h-[420px] rounded-lg" /></GridItem>
      <GridItem span={{ base: 12, lg: 4 }}><Skeleton className="h-[420px] rounded-lg" /></GridItem>
      <GridItem span={{ base: 4, lg: 4 }}><Skeleton className="h-[140px] rounded-lg" /></GridItem>
      <GridItem span={{ base: 4, lg: 4 }}><Skeleton className="h-[140px] rounded-lg" /></GridItem>
      <GridItem span={{ base: 8, lg: 4 }}><Skeleton className="h-[140px] rounded-lg" /></GridItem>
      <GridItem><Skeleton className="h-[330px] rounded-lg" /></GridItem>
    </PageGrid>
  )
}
