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
 * "Check first": the time-sensitive few (a refill, a renewal within two days, a failing connector, money near
 * liquidation) plus one chip for everything waiting in Coach. Only rendered when there is something to show.
 * Three cards side by side on a laptop, a swipeable row on a phone.
 */
export function AttentionStrip({ cards, coach }: { cards: AttentionCard[]; coach: number }) {
  const shown = cards.slice(0, MAX_CARDS)
  if (!shown.length && !coach) return null
  return (
    <section aria-labelledby="check-first">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 id="check-first" className="font-mono text-label text-ink-3 uppercase">Check first{shown.length ? ` · ${shown.length}` : ''}</h2>
        {coach ? (
          <Link href="/coach" className="inline-flex h-10 items-center gap-0.5 rounded-md px-1 text-small font-semibold text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">
            All in Coach · {coach}<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {shown.map((c) => <li key={c.key} className="w-[290px] shrink-0 snap-start lg:w-auto"><Card c={c} /></li>)}
        {!shown.length ? <li className="w-full"><Card c={{ key: 'coach', tone: 'info', kind: 'coach', title: `${coach} thing${coach === 1 ? '' : 's'} need${coach === 1 ? 's' : ''} you`, detail: 'Decisions and data waiting in Coach', href: '/coach' }} /></li> : null}
      </ul>
    </section>
  )
}

function Card({ c }: { c: AttentionCard }) {
  const Icon = ICON[c.kind]
  const tone = TONE[c.tone]
  const cls = 'group flex h-full min-h-16 items-center gap-3 rounded-lg bg-surface p-3 shadow-1 transition-[box-shadow] duration-150 hover:shadow-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill'
  const body = (
    <>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md" style={{ color: tone, background: `color-mix(in oklch, ${tone} 14%, transparent)` }}>
        <Icon className="size-5" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-ink">{c.title}</span>
        <span className="block truncate text-caption text-ink-3">{c.detail}</span>
      </span>
      <span className={cn('inline-flex h-8 shrink-0 items-center rounded-full bg-surface-2 px-3 text-caption font-semibold text-ink transition-[background-color] duration-150 group-hover:bg-surface-3')}>{ACTION[c.kind]}</span>
    </>
  )
  return c.peek ? <PeekLink to={c.peek} className={cls}>{body}</PeekLink> : <Link href={c.href} className={cls}>{body}</Link>
}
