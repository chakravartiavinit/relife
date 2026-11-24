'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { PeekRef } from '@/domain/peek'
import type { PictureRef } from '@/ui/picture'
import { cn } from '@/ui/cn'
import { Card } from '../card'
import { StatusRow } from '../status-row'

export type AttentionKind = 'risk' | 'money' | 'medicine' | 'routine' | 'sync' | 'coach'
export type AttentionCard = { key: string; tone: 'bad' | 'warn' | 'info'; kind: AttentionKind; title: string; detail: string; href: string; peek?: PeekRef }

/** The one inline action each card offers, in the words the mockup uses. */
const ACTION: Record<AttentionKind, string> = { risk: 'Review', money: 'Review', medicine: 'Refill', routine: 'Open', sync: 'Fix', coach: 'Open' }

/** What each card shows at its left: the Coach picture, the routine, the service, the failing connector or Wealth. */
const pictureOf = (c: AttentionCard): PictureRef => {
  switch (c.kind) {
    case 'coach': return { of: 'nav', to: '/coach' }
    case 'medicine':
    case 'routine': return { of: 'routine', name: c.title, kind: c.kind }
    case 'money': return { of: 'merchant', name: c.title, category: 'Subscriptions' }
    case 'sync': return { of: 'connector', id: c.detail.split(',')[0].trim() }
    case 'risk': return { of: 'area', to: 'wealth' }
  }
}

/** At most this many cards show; the rest are one tap away in Coach. */
export const MAX_CARDS = 3

/**
 * "Check first", a card in Today's rail: the time-sensitive few (a refill, a renewal within two days, a failing
 * connector, money near liquidation), one line each with its action, plus what waits in Coach. With nothing urgent it
 * is the Coach line alone, with the Coach picture. Only rendered when there is something to show.
 */
export function AttentionStrip({ cards, coach, className }: { cards: AttentionCard[]; coach: number; className?: string }) {
  const shown = cards.slice(0, MAX_CARDS)
  if (!shown.length && !coach) return null
  const rows = shown.length ? shown : [{ key: 'coach', tone: 'info', kind: 'coach', title: `${coach} thing${coach === 1 ? '' : 's'} need${coach === 1 ? 's' : ''} you`, detail: 'Decisions and data waiting in Coach', href: '/coach' } satisfies AttentionCard]
  return (
    <Card aria-labelledby={shown.length ? 'check-first' : undefined} aria-label={shown.length ? undefined : 'Check first'} className={cn('px-5 py-3', className)}>
      {shown.length ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          <h2 id="check-first" className="font-display text-heading text-ink">Check first</h2>
          {coach ? (
            <Link href="/coach" className="-me-1 inline-flex h-9 items-center gap-0.5 rounded-md px-1 text-small font-medium text-ink-2 hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-pill">
              All in Coach · {coach}<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
      <div>
        {rows.map((c) => (
          <StatusRow
            key={c.key} picture={pictureOf(c)} pictureSize={40} name={c.title} line={c.detail}
            {...(c.peek ? { peek: c.peek } : { href: c.href })}
            trailing={<span aria-hidden className="inline-flex h-8 items-center rounded-md bg-surface px-3 text-small font-medium text-ink shadow-1">{ACTION[c.kind]}</span>}
          />
        ))}
      </div>
    </Card>
  )
}
