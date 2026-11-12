'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { PulseTile } from '@/core/pulse'
import { cn } from '@/ui/cn'
import { Sparkline } from '../charts'
import { openCapture } from '../capture/capture-data'
import { PeekLink } from '../peek/peek-link'

const CELL = 'group flex h-full min-w-0 flex-col gap-1 p-3 text-start transition-colors duration-150 ease-out-quint hover:bg-ink/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pill dark:hover:bg-white/[0.04]'

/**
 * Life pulse: the six areas and Time, each a key number for today with one line of context and a 7-day trend. A
 * cell opens the area's Peek; one with nothing logged says so and opens Capture. One card of seven cells on a wide
 * laptop, a swipeable row of tiles below that.
 */
export function PulseRow({ tiles }: { tiles: PulseTile[] }) {
  return (
    <section aria-labelledby="life-pulse">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 id="life-pulse" className="font-mono text-label text-ink-3 uppercase">Life pulse</h2>
        <Link href="/life" className="inline-flex h-10 items-center gap-0.5 rounded-md px-1 text-small font-semibold text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">
          Open Life<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
      <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 xl:mx-0 xl:grid xl:grid-flow-col xl:auto-cols-fr xl:gap-0 xl:overflow-hidden xl:rounded-lg xl:bg-surface xl:p-0 xl:pb-0 xl:shadow-1">
        {tiles.map((t) => (
          <li key={t.slug} className="w-[136px] shrink-0 snap-start overflow-hidden rounded-lg bg-surface shadow-1 xl:w-auto xl:rounded-none xl:shadow-none xl:not-first:border-s xl:not-first:border-divider">
            <Cell t={t} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Cell({ t }: { t: PulseTile }) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5 text-caption text-ink-3">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
        <span className="truncate">{t.title} · {t.measure}</span>
      </span>
      <span className={cn('num truncate text-title', t.tone === 'bad' ? 'text-bad' : t.tone === 'good' ? 'text-good' : 'text-ink', t.action && 'text-ink-3')}>{t.value}</span>
      <span className="line-clamp-1 text-caption text-ink-3" title={t.sub}>{t.sub ?? ' '}</span>
      <span className="mt-auto block h-8 pt-1" aria-hidden={!t.spark}>
        {t.spark ? <Sparkline data={t.spark} color={t.color} height={28} label={`${t.title} ${t.measure}, last 7 days`} /> : null}
      </span>
    </>
  )
  return t.action ? (
    <button type="button" onClick={() => openCapture()} className={cn(CELL, 'w-full')}>{inner}</button>
  ) : (
    <PeekLink to={t.peek} className={CELL} aria-label={`${t.title}, ${t.measure}: ${t.value}. Open details`}>{inner}</PeekLink>
  )
}
