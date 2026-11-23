'use client'

import Link from 'next/link'
import { AlarmClock, BellRing, CalendarClock, ChevronRight, Pill, TriangleAlert, Unplug, type LucideIcon } from 'lucide-react'
import type { PeekRef } from '@/domain/peek'
import { cn } from '@/ui/cn'
import { PeekLink } from '../peek/peek-link'

export type AttentionKind = 'risk' | 'money' | 'medicine' | 'routine' | 'sync' | 'coach'
export type AttentionCard = { key: string; tone: 'bad' | 'warn' | 'info'; kind: AttentionKind; title: string; detail: string; href: string; peek?: PeekRef }

const ICON: Record<AttentionKind, LucideIcon> = { risk: TriangleAlert, money: CalendarClock, medicine: Pill, routine: AlarmClock, sync: Unplug, coach: BellRing }
/** The one inline action each card offers, in the words the mockup uses. */
const ACTION: Record<AttentionKind, string> = { risk: 'Review', money: 'Review', medicine: 'Refill', routine: 'Open', sync: 'Fix', coach: 'Open' }
const TONE = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--pill)' } as const

/** At most this many cards show; the rest are one tap away in Coach. */
export const MAX_CARDS = 3

/**
 * "Check first", a card in Today's rail: the time-sensitive few (a refill, a renewal within two days, a failing
 * connector, money near liquidation), one line each with its action, plus what waits in Coach. With nothing urgent it
 * is the Coach line alone. Only rendered when there is something to show.
 */
export function AttentionStrip({ cards, coach, className }: { cards: AttentionCard[]; coach: number; className?: string }) {
  const shown = cards.slice(0, MAX_CARDS)
  if (!shown.length && !coach) return null
  return (
    <section aria-labelledby="check-first" className={cn('relative rounded-lg bg-surface px-5 py-4 shadow-1', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="check-first" className="text-small font-medium text-ink-3">Check first{shown.length ? ` · ${shown.length}` : ''}</h2>
        {coach && shown.length ? (
          <Link href="/coach" className="-me-1 inline-flex h-8 items-center gap-0.5 rounded-md px-1 text-small font-medium text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">
            All in Coach · {coach}<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-divider">
        {shown.map((c) => <li key={c.key}><Row c={c} /></li>)}
        {!shown.length ? <li><Row c={{ key: 'coach', tone: 'info', kind: 'coach', title: `${coach} thing${coach === 1 ? '' : 's'} need${coach === 1 ? 's' : ''} you`, detail: 'Decisions and data waiting in Coach', href: '/coach' }} /></li> : null}
      </ul>
    </section>
  )
}

function Row({ c }: { c: AttentionCard }) {
  const Icon = ICON[c.kind]
  const tone = TONE[c.tone]
  const cls = 'group flex min-h-14 items-center gap-3 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
  const body = (
    <>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md" style={{ color: tone, background: `color-mix(in oklch, ${tone} 14%, transparent)` }}>
        <Icon className="size-5" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink">{c.title}</span>
        <span className="block truncate text-caption text-ink-3">{c.detail}</span>
      </span>
      <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-surface-2 px-3 text-caption font-medium text-ink transition-[background-color] duration-150 group-hover-fine:bg-surface-3">{ACTION[c.kind]}</span>
    </>
  )
  return c.peek ? <PeekLink to={c.peek} className={cls}>{body}</PeekLink> : <Link href={c.href} className={cls}>{body}</Link>
}
