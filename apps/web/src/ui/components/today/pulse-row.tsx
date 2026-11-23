'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { PulseTile } from '@/core/pulse'
import { cn } from '@/ui/cn'
import { SectionLabel } from '../card'
import { Sparkline } from '../charts'
import { openCapture } from '../capture/capture-data'
import { PeekLink } from '../peek/peek-link'

// One cell is a grid of its own: on a phone a list row (the area and its note on the left, the number and a trend on
// the right); from 640px of page a tile (the area on top, the number with its trend beside it, the note under).
const CELL = 'group grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 bg-surface px-4 py-3 text-start transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill grid-md:grid-cols-[minmax(0,1fr)_auto] grid-md:gap-y-1 grid-md:py-3.5'

/** The heading above the pulse: the label and the link to Life. A separate piece so the page can put it above the pulse and Money together. */
export function PulseHead() {
  return (
    <SectionLabel id="life-pulse" rule action={
      <Link href="/life" className="inline-flex h-10 items-center gap-0.5 rounded-md px-1 text-small font-medium text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">
        Open Life<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
      </Link>
    }>Life pulse</SectionLabel>
  )
}

/**
 * Life pulse: the areas and Time, each a key number for today with one line of context and a 7-day trend. A cell opens
 * the area's Peek; one with nothing logged says so and opens Capture. One card, three columns by two rows on a laptop
 * (Wealth sits in Money today beside it, so its cell is left out there), two columns on a tablet, a list on a phone.
 */
export function PulseRow({ tiles }: { tiles: PulseTile[] }) {
  return (
    <ul aria-labelledby="life-pulse" className="grid h-full grid-cols-1 gap-px overflow-hidden rounded-lg bg-divider shadow-1 grid-md:grid-cols-2 grid-lg:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.slug} className={cn('min-w-0', t.slug === 'wealth' && 'grid-md:hidden')}>
          <Cell t={t} />
        </li>
      ))}
    </ul>
  )
}

function Cell({ t }: { t: PulseTile }) {
  const inner = (
    <>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 text-small text-ink-2 grid-md:col-span-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
        <span className="truncate">{t.title}<span className="text-ink-3"> · {t.measure}</span></span>
      </span>
      <span className={cn('num col-start-2 row-span-2 row-start-1 text-title grid-md:col-start-1 grid-md:row-span-1 grid-md:row-start-2 grid-md:mt-1', t.tone === 'bad' ? 'text-bad' : t.tone === 'good' ? 'text-good' : 'text-ink', t.action && 'text-ink-3')}>{t.value}</span>
      <span className="col-start-3 row-span-2 row-start-1 block h-8 w-16 grid-md:col-start-2 grid-md:row-span-1 grid-md:row-start-2 grid-md:w-24" aria-hidden={!t.spark}>
        {t.spark ? <Sparkline data={t.spark} color={t.color} height={28} label={`${t.title} ${t.measure}, last 7 days`} /> : null}
      </span>
      <span className="col-start-1 row-start-2 line-clamp-1 text-caption text-ink-3 grid-md:col-span-2 grid-md:row-start-3" title={t.sub}>{t.sub ?? ' '}</span>
    </>
  )
  return t.action ? (
    <button type="button" onClick={() => openCapture()} className={cn(CELL, 'w-full')}>{inner}</button>
  ) : (
    <PeekLink to={t.peek} className={CELL} aria-label={`${t.title}, ${t.measure}: ${t.value}. Open details`}>{inner}</PeekLink>
  )
}
