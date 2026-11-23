import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChartColumn } from 'lucide-react'
import { getUser } from '@/core/user'
import { addDays, localDate } from '@/core/time'
import { achievementBoard, recentXp, xpBreakdown, xpByDay, xpSummary } from '@/core/xp'
import { TITLES } from '@/domain/xp'
import { fillDays } from '@/domain/series'
import { formatNumber } from '@/domain/money'
import { Skeleton } from '@/ui/components/card'
import { DailyBars } from '@/ui/components/charts'
import { TitleTrack } from '@/ui/components/xp'
import { AchievementsBoard } from '@/ui/components/achievements-board'
import { CloseToUnlocking } from '@/ui/components/close-to-unlocking'
import { CharacterSheet } from '@/ui/components/hud'
import { Consistency } from '@/ui/components/consistency'
import { Fold } from '@/ui/components/fold'
import { LifeKpis } from '@/ui/components/life-kpis'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { ProgressBlock } from '@/ui/components/progress-block'
import { Rail } from '@/ui/components/rail'
import { HowXpWorks, RecentXp, XpMix } from '@/ui/components/xp-blocks'
import { freezesHeld } from '@/core/quests'
import { showUpStreak } from '@/ui/components/life-kpis'
import { PartyCard } from '@/ui/components/party/party-card'
import { partyCard } from '@/core/party'

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
  const [s, board, daily, mix, feed, streak, freezes] = await Promise.all([
    xpSummary(user, now), achievementBoard(user, now), xpByDay(user, from30, today), xpBreakdown(user, from30, today),
    recentXp(user, 60), showUpStreak(user, today), freezesHeld(user),
  ])

  // Activity feed: the last three days that earned XP, biggest awards first; only the newest is open.
  const days = [...new Set(feed.map((e) => e.d))].slice(0, 3)
  const tierOf = new Map(board.map((a) => [a.key, a.tier]))
  const items = board.map((a) => ({ ...a, unlockedAt: a.unlockedAt ? a.unlockedAt.toISOString() : null, unlockedOn: a.unlockedAt ? localDate(a.unlockedAt, user.timezone) : null }))
  const xp30 = [...daily.values()].reduce((a, b) => a + b, 0)
  const unlocked = items.filter((a) => a.unlockedAt)

  // The phone's order is the DOM order: the sheet, Close to unlocking, then everything else as folds.
  return (
    <PageGrid>
      <GridItem span={{ base: 12, lg: 8 }}>
        <CharacterSheet s={s} name={user.name} streak={streak} freezes={freezes} areas={user.profile.areas} today={today}>
          <Fold inline title="Titles" summary={`${s.title} now`}>
            <TitleTrack level={s.level} titles={TITLES} />
          </Fold>
        </CharacterSheet>
      </GridItem>
      <GridItem span={{ base: 12, lg: 4 }}><CloseToUnlocking items={items} /></GridItem>

      {/* Its own read, so a slow or failing party never holds up the rest of the page. No wrapper when nothing shows. */}
      <Suspense fallback={<GridItem><Skeleton className="h-[200px] rounded-lg" /></GridItem>}>
        <PartySlot />
      </Suspense>

      <GridItem className="flex *:flex-1">
        <ProgressBlock headless title="Achievements" summary={`${unlocked.length} of ${items.length} unlocked · ${formatNumber(unlocked.reduce((n, a) => n + a.xp, 0))} XP`}>
          <AchievementsBoard items={items} />
        </ProgressBlock>
      </GridItem>

      <GridItem className="flex *:flex-1"><LifeKpis user={user} now={now} /></GridItem>

      <GridItem span={{ base: 12, lg: 8 }} className="flex *:flex-1"><Consistency user={user} now={now} /></GridItem>
      <Rail as="aside" aria-label="Scoring" span={{ base: 12, lg: 4 }}>
        <XpMix mix={mix} />
        <HowXpWorks />
      </Rail>

      <GridItem span={{ base: 12, lg: 8 }} className="flex *:flex-1">
        <ProgressBlock title="XP per day" icon={<ChartColumn strokeWidth={2} />} color="var(--pill)" description={`Last 30 days · ${formatNumber(xp30)} XP`} summary={`${formatNumber(xp30)} XP in 30 days`}>
          <DailyBars data={fillDays(daily, from30, today, 0)} color="var(--pill)" unit="XP" height={330} label="XP per day, last 30 days" />
        </ProgressBlock>
      </GridItem>
      <GridItem span={{ base: 12, lg: 4 }} className="flex *:flex-1"><RecentXp feed={feed} days={days} today={today} tierOf={tierOf} /></GridItem>
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
      <GridItem span={{ base: 12, lg: 8 }}><Skeleton className="h-[420px] rounded-lg" /></GridItem>
      <GridItem span={{ base: 12, lg: 4 }}><Skeleton className="h-[420px] rounded-lg" /></GridItem>
      <GridItem><Skeleton className="h-[330px] rounded-lg" /></GridItem>
      <GridItem><Skeleton className="h-[220px] rounded-lg" /></GridItem>
    </PageGrid>
  )
}
