import type { Metadata } from 'next'
import { connection } from 'next/server'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { TEMPLATES } from '@/core/onboarding'
import { builtInPacks } from '@/core/packs'
import { quietHours } from '@/domain/notify'
import { loadConnectorItems } from '@/core/connector-items'
import { requestOrigin } from '@/core/auth/trust'
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
  const [schedules, trackers, { items }] = await Promise.all([
    db.select({ name: schema.schedules.name, target: schema.schedules.target, meta: schema.schedules.meta }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    db.select({ slug: schema.trackers.slug, target: schema.trackers.target }).from(schema.trackers)
      .where(and(eq(schema.trackers.userId, user.id), inArray(schema.trackers.slug, ['sleep.hours', 'steps']))),
    loadConnectorItems(user, requestOrigin(await headers())),
  ])
  const target = (slug: string) => trackers.find((t) => t.slug === slug)?.target ?? undefined
  const water = schedules.find((s) => (s.meta as { trackerSlug?: string }).trackerSlug && s.target)?.target ?? undefined
  const p = user.profile
  // Usual hours start from what was saved, else from the quiet hours already in use.
  const quiet = quietHours(p.notifications)
  return (
    <OnboardingFlow
      today={localDate(new Date(), user.timezone)}
      fresh={!p.onboardedAt}
      templates={TEMPLATES}
      // The Connect step offers a few of these for the picked areas. The sync history stays on the server.
      sources={items.filter((c) => c.section !== 'ai').map((c) => ({ ...c, syncs: undefined }))}
      packs={builtInPacks()}
      // The AI step: cloud providers open their own connect dialog; the free local server is checked on its own.
      providers={items.filter((c) => c.section === 'ai').map((c) => ({ ...c, syncs: undefined }))}
      existing={schedules.map((s) => s.name.toLowerCase())}
      timezones={Intl.supportedValuesOf('timeZone')}
      currencies={Intl.supportedValuesOf('currency')}
      initial={{
        name: user.name === 'Me' ? '' : user.name,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
        areas: p.areas ?? [],
        focus: p.focus,
        improve: p.improve ?? [],
        wake: p.day?.wake ?? quiet?.to ?? '07:00',
        sleep: p.day?.sleep ?? quiet?.from ?? '23:00',
        // Saved targets are shown as they are, so nothing is rounded to a preset.
        sleepHours: target('sleep.hours') ?? 7.5,
        steps: target('steps') ?? 8000,
        waterMl: water ?? 3000,
        tone: p.tone ?? 'balanced',
        goals: p.goals ?? '',
        constraints: p.constraints ?? '',
      }}
    />
  )
}
