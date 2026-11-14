import Link from 'next/link'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { ArrowRight, Check, ChevronRight, Compass } from 'lucide-react'
import { db, schema } from '@/db'
import type { User } from '@/core/user'
import { hideSetupChecklist } from '@/app/actions'
import { Capsule } from './capsule'
import { buttonClass } from './button'
import { cn } from '../cn'
import { env } from '@/core/env'
import { connectors } from '@/connectors'

export type Step = { id: string; title: string; body: string; href: string; cta: string; done: boolean }

/** First-run checklist. Each step is "done" from real state, never a stored flag. */
export async function onboardingSteps(user: User): Promise<Step[]> {
  const [[routines], [inbox], on, [phone]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.schedules).where(eq(schema.schedules.userId, user.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.rawEvents)
      .where(and(eq(schema.rawEvents.userId, user.id), inArray(schema.rawEvents.source, ['shortcuts', 'sleep', 'health-connect']))),
    db.select({ id: schema.connections.connectorId }).from(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.devices).where(and(eq(schema.devices.userId, user.id), eq(schema.devices.kind, 'phone'), isNull(schema.devices.revokedAt))),
  ])
  const has = (k: string) => !!env(k)
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
      body: 'Check things off with one tap from your phone.', done: has('TELEGRAM_BOT_TOKEN') && has('TELEGRAM_ALLOWED_CHAT_ID'),
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
  ]
}

/**
 * Today's side rail: every setup step at a glance. Done ones are ticked, the next one is open with its
 * action, the rest are one line each. The tour's last stop points here; Hide puts it away for good.
 */
export function OnboardingCompact({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  if (!next) return null
  return (
    <section data-tour="setup" aria-labelledby="setup-h" className="rounded-lg bg-surface p-5 shadow-1">
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-h" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Finish setting up</h2>
        <span className="flex items-center gap-1">
          <span className="text-[12px] text-ink-3 tabular-nums">{done} of {steps.length}</span>
          <form action={hideSetupChecklist}>
            <button type="submit" className={buttonClass({ variant: 'ghost', size: 'sm', className: '-me-2 h-10 px-2 text-[12px] text-ink-3' })}>Hide</button>
          </form>
        </span>
      </div>
      <Capsule value={done} max={steps.length} label="Setup progress" size="sm" color="var(--good)" className="mt-2" />

      <ol className="mt-4 flex flex-col gap-1">
        {steps.map((s, k) => {
          const now = s === next
          if (now) {
            return (
              // Concentric: radius 16 block, 12px padding, radius 8 button.
              <li key={s.id} aria-current="step" className="rounded-[16px] bg-pill-wash p-3 shadow-[0_0_0_1.5px_var(--pill)]">
                <p className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-pill text-[11px] font-bold text-white tabular-nums">{k + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-5 font-semibold text-ink">{s.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{s.body}</span>
                  </span>
                </p>
                <Link href={s.href} className={buttonClass({ variant: 'primary', size: 'md', className: 'mt-3 ms-[30px] h-10' })}>
                  {s.cta}<ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2} />
                </Link>
              </li>
            )
          }
          return (
            <li key={s.id}>
              <Link href={s.href} className={cn(
                'group flex min-h-10 items-center gap-2.5 rounded-[12px] px-3 py-2 transition-[background-color] duration-150 ease-out-quint hover:bg-surface-2',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
              )}>
                {s.done ? (
                  <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-good text-white"><Check className="size-3" strokeWidth={3} /></span>
                ) : (
                  <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)] tabular-nums">{k + 1}</span>
                )}
                <span className={cn('min-w-0 flex-1 truncate text-[13px] leading-5', s.done ? 'text-ink-3' : 'font-medium text-ink-2 group-hover:text-ink')}>
                  {s.title}<span className="sr-only">{s.done ? ' (done)' : ''}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3 transition-[translate,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink rtl:-scale-x-100" strokeWidth={1.5} />
              </Link>
            </li>
          )
        })}
      </ol>

      {/* A full load: the tour opens from the address on arrival. */}
      <a href="/?tour" className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-[12.5px] font-medium text-ink-3 transition-[color] duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">
        <Compass className="size-3.5" strokeWidth={2} aria-hidden />Replay the tour
      </a>
    </section>
  )
}
