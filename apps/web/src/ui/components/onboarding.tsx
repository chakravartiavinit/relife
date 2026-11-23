import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { User } from '@/core/user'
import { envFor } from '@/core/env'
import { telegramConfigured } from '@/core/notify'
import { connectors } from '@/connectors'

export type Step = { id: string; title: string; body: string; href: string; cta: string; done: boolean }

/** First-run checklist. Each step is "done" from real state, never a stored flag. */
export async function onboardingSteps(user: User): Promise<Step[]> {
  const [[routines], [inbox], on, [phone], [imported]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.userId, user.id), inArray(schema.rawEvents.source, ['shortcuts', 'sleep', 'health-connect']))),
    db.select({ id: schema.connections.connectorId }).from(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.devices).where(and(eq(schema.devices.userId, user.id), eq(schema.devices.kind, 'phone'), isNull(schema.devices.revokedAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.imports).where(and(eq(schema.imports.userId, user.id), eq(schema.imports.status, 'done'), isNull(schema.imports.undoneAt))),
  ])
  const has = (k: string) => !!envFor(user.id, k)
  // A data source connected anywhere counts, including the username ones from setup's Connect step (not Telegram or an AI key).
  const sources = on.some((c) => connectors.some((k) => k.id === c.id && k.category))
  return [
    {
      id: 'routine', title: 'Add your first routine', cta: 'Add routine', href: '/plan/routines?new=1',
      body: 'Something small you do every day, like skincare, water or a medicine.', done: routines.n > 0,
    },
    {
      id: 'goals', title: 'Write what levelling up means to you', cta: 'Set goals', href: '/you/settings',
      body: 'Your coach reads this before every suggestion.', done: !!user.profile.goals?.trim(),
    },
    {
      id: 'telegram', title: 'Get reminders on Telegram', cta: 'Connect Telegram', href: '/you/connections',
      body: 'Check things off with one tap from your phone.', done: telegramConfigured(user),
    },
    {
      id: 'sources', title: 'Connect GitHub, Binance or an order app', cta: 'Connect an app', href: '/you/connections',
      body: 'Commits, trades and what you spend on Zomato, Amazon and others flow in by themselves, at full XP.',
      done: sources || has('GITHUB_TOKEN') || has('BINANCE_API_KEY'),
    },
    {
      id: 'phone', title: 'Use it on your phone', cta: 'Set up', href: '/you/settings/devices/phone',
      body: 'Scan a code, add it to your home screen, get reminders there.', done: phone.n > 0,
    },
    {
      id: 'iphone', title: 'Send steps and sleep from your iPhone', cta: 'Open guide', href: '/you/connections',
      body: 'A few Shortcuts automations, and your step and sleep quests clear themselves.', done: inbox.n > 0,
    },
    {
      id: 'import', title: 'Bring your history', cta: 'Import a file', href: '/you/connections?import=1',
      body: 'A bank statement, a tracker CSV, an Apple Health or Google Takeout export. Your charts start with the past, not an empty page.', done: imported.n > 0,
    },
  ]
}
