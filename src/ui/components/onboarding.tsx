import Link from 'next/link'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { ArrowRight } from 'lucide-react'
import { db, schema } from '@/db'
import type { User } from '@/core/user'
import { Capsule } from './capsule'
import { env } from '@/core/env'

export type Step = { id: string; title: string; body: string; href: string; cta: string; done: boolean }

/** First-run checklist. Each step is "done" from real state, never a stored flag. */
export async function onboardingSteps(user: User): Promise<Step[]> {
  const [[routines], [inbox]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.userId, user.id), inArray(schema.rawEvents.source, ['sms', 'shortcuts', 'sleep', 'ocr']))),
  ])
  const has = (k: string) => !!env(k)
  return [
    {
      id: 'routine', title: 'Add your first routine', cta: 'Add routine', href: '/habits?new=1',
      body: 'Something small you do every day, like skincare, water or a medicine.', done: routines.n > 0,
    },
    {
      id: 'goals', title: 'Write what levelling up means to you', cta: 'Set goals', href: '/settings',
      body: 'Your observer reads this before every suggestion.', done: !!user.profile.goals?.trim(),
    },
    {
      id: 'telegram', title: 'Get reminders on Telegram', cta: 'Connect', href: '/connectors',
      body: 'Check things off with one tap from your phone.', done: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_ALLOWED_CHAT_ID'),
    },
    {
      id: 'sources', title: 'Connect GitHub, Binance or Gmail', cta: 'Connect', href: '/connectors',
      body: 'Commits, trades and bank alerts flow in by themselves.',
      done: has('GITHUB_TOKEN') || has('BINANCE_API_KEY') || has('GMAIL_REFRESH_TOKEN'),
    },
    {
      id: 'iphone', title: 'Send bank SMS, steps and sleep from your iPhone', cta: 'Open guide', href: '/connectors',
      body: 'A few Shortcuts automations. See docs/SHORTCUTS.md.', done: inbox.n > 0,
    },
  ]
}

/** Side-rail version for Today: progress and the next step only. */
export function OnboardingCompact({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  if (!next) return null
  return (
    <section aria-labelledby="setup-h" className="rounded-lg bg-surface p-5 shadow-1">
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-h" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Finish setting up</h2>
        <span className="text-[12px] text-ink-3 tabular-nums">{done} of {steps.length}</span>
      </div>
      <Capsule value={done} max={steps.length} label="Setup progress" size="sm" color="var(--good)" className="mt-3" />
      <Link href={next.href} className="group mt-4 flex items-start gap-3 rounded-md">
        <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg tabular-nums">{done + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug font-medium text-ink group-hover:underline">{next.title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{next.body}</span>
        </span>
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-3 transition-[translate] duration-150 group-hover:translate-x-0.5" strokeWidth={1.5} />
      </Link>
    </section>
  )
}
