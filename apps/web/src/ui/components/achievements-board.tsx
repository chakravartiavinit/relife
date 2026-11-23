'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CATEGORY } from '../tokens'
import { TIER_COLOR as TIER } from '../achievement-icons'
import { cn } from '../cn'
import { SHOW_LOCKED } from './all-locked-link'
import { fmt, lockedFirst, type BoardItem } from './achievement-parts'
import { Chip } from './chip'
import { Picture } from './picture'
import { ShareButton } from './share/share-button'

export type { BoardItem } from './achievement-parts'

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }
/** A local YYYY-MM-DD as "9 Nov 2026". */
const date = (day: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

type Filter = 'all' | 'unlocked' | 'locked'
const LIMIT = 8

/**
 * Every badge in a four-column grid (two rows to start, the rest one click away): filters All · Unlocked · Locked, and
 * `/you#locked` on load, or Next unlocks' link (an event), opens it on Locked. Its fold (the page's) has the title and the count.
 */
export function AchievementsBoard({ items }: { items: BoardItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [all, setAll] = useState(false)
  useEffect(() => {
    // Show Locked, open the phone's fold around the board, then scroll to it.
    const showLocked = () => {
      setFilter('locked')
      const board = document.getElementById('achievements')
      board?.closest('details')?.setAttribute('open', '')
      // Two frames later: a fold that has just opened has no box yet, and a scroll to it does nothing.
      requestAnimationFrame(() => requestAnimationFrame(() => board?.scrollIntoView({ block: 'start' })))
    }
    if (window.location.hash === '#locked') showLocked()
    window.addEventListener(SHOW_LOCKED, showLocked)
    return () => window.removeEventListener(SHOW_LOCKED, showLocked)
  }, [])
  const unlocked = items.filter((a) => a.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!))
  const locked = lockedFirst(items)
  const list = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : [...unlocked, ...locked]
  const visible = all ? list : list.slice(0, LIMIT)

  return (
    <div id="achievements" className="scroll-mt-6">
      <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-2">
        {([['all', 'All', items.length], ['unlocked', 'Unlocked', unlocked.length], ['locked', 'Locked', locked.length]] as const).map(([k, label, n]) => (
          <Chip key={k} selected={filter === k} count={n} onClick={() => setFilter(k)}>{label}</Chip>
        ))}
      </div>
      {list.length ? (
        // The grid is 1px wider than the card, so the last column's right rule is clipped.
        <div className="-mx-5 overflow-hidden border-t border-divider">
          <ul className="-me-px grid grid-cols-1 grid-md:grid-cols-2 grid-lg:grid-cols-4">
            {visible.map((a) => <Tile key={a.key} a={a} />)}
          </ul>
        </div>
      ) : <p className="text-small text-ink-3">Nothing here yet. Check things off and the first badges come quickly.</p>}
      {list.length > LIMIT ? (
        <div className="-mx-5 -mb-2 flex justify-center border-t border-divider pt-1">
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((x) => !x)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-4 text-small font-medium text-ink-2 transition-[color,scale] duration-150 ease-out-quint hover-fine:text-ink active:scale-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
          >
            {all ? 'Show fewer' : `Show all ${list.length}`}
            <ChevronDown className={cn('size-4 transition-[rotate] duration-150 ease-out-quint', all && 'rotate-180')} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Tile({ a }: { a: BoardItem }) {
  const done = !!a.unlockedAt
  const area = a.area !== 'general' ? CATEGORY[a.area] : null
  return (
    <li className={cn('relative flex gap-3 border-r border-b border-divider px-5 py-4', !done && 'bg-surface-2/40')}>
      <Picture of="achievement" id={a.key} tier={a.tier} unlocked={done} size={40} />
      <div className="min-w-0 flex-1 pe-6">
        <h3 className={cn('text-body font-medium', done ? 'text-ink' : 'text-ink-2')}>{a.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-small text-ink-3">{a.description}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-caption text-ink-3 tabular-nums">
          <span className="font-medium" style={{ color: `color-mix(in oklch, ${TIER[a.tier]} 70%, var(--ink))` }}>{TIER_LABEL[a.tier]}</span>
          {area ? <><span aria-hidden>·</span><span className="inline-flex items-center gap-1"><span aria-hidden className="size-1.5 rounded-full" style={{ background: area.color }} />{area.label}</span></> : null}
          <span aria-hidden>·</span>
          {done ? <span>{date(a.unlockedOn!)}</span> : <span>{fmt(a.progress.value)}/{fmt(a.progress.target)}</span>}
        </p>
        <span className="sr-only">{done ? 'Unlocked' : 'Locked'}{a.xp ? `, worth ${a.xp} XP` : ''}</span>
      </div>
      {done ? <ShareButton kind="achievement" refId={a.key} label={`Share ${a.name}`} className="absolute end-2 top-2" /> : null}
    </li>
  )
}
