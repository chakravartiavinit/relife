import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { TEMPLATES } from '@/core/onboarding'
import { totalXp } from '@/core/xp'
import { levelFor, titleFor } from '@/domain/xp'
import { OnboardingFlow } from '@/ui/components/onboarding-flow'

export const metadata: Metadata = { title: 'Welcome' }

// One-time setup. Today redirects here until it's finished or skipped; it can be reopened anytime.
export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg" />}>
      <Welcome />
    </Suspense>
  )
}

async function Welcome() {
  await connection()
  const user = await getUser()
  const [schedules, trackers, xp] = await Promise.all([
    db.select({ name: schema.schedules.name, target: schema.schedules.target, meta: schema.schedules.meta }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    db.select({ slug: schema.trackers.slug, target: schema.trackers.target }).from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), inArray(schema.trackers.slug, ['sleep.hours', 'steps']))),
    totalXp(user),
  ])
  // First setup is a fresh start (earlier XP is cleared on finish), so it starts at Level 1.
  const lv = levelFor(user.profile.onboardedAt ? xp : 0)
  const target = (slug: string) => trackers.find((t) => t.slug === slug)?.target ?? undefined
  const water = schedules.find((s) => (s.meta as { trackerSlug?: string }).trackerSlug && s.target)?.target ?? undefined
  const p = user.profile
  return (
    <OnboardingFlow
      today={localDate(new Date(), user.timezone)}
      level={{ level: lv.level, title: titleFor(lv.level), progress: lv.progress }}
      fresh={!user.profile.onboardedAt}
      templates={TEMPLATES}
      existing={schedules.map((s) => s.name.toLowerCase())}
      timezones={Intl.supportedValuesOf('timeZone')}
      currencies={Intl.supportedValuesOf('currency')}
      initial={{
        name: user.name === 'Me' ? '' : user.name,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
        areas: p.areas ?? [],
        focus: p.focus,
        goals: p.goals ?? '',
        constraints: p.constraints ?? '',
        tone: p.tone ?? 'balanced',
        sleepHours: snap(target('sleep.hours') ?? 7.5, [7, 7.5, 8, 8.5]),
        steps: snap(target('steps') ?? 8000, [5000, 8000, 10000, 12000]),
        waterMl: snap(water ?? 3000, [2000, 2500, 3000, 3500]),
      }}
    />
  )
}

/** Closest allowed option, so the segmented controls always show a selection. */
function snap(v: number, options: number[]) {
  return options.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best))
}
