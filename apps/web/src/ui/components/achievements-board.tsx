'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CATEGORY } from '../tokens'
import { TIER_COLOR as TIER } from '../achievement-icons'
import { cn } from '../cn'
import { fmt, lockedFirst, Medallion, type BoardItem } from './achievement-parts'
import { ShareButton } from './share/share-button'

export type { BoardItem } from './achievement-parts'

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }
/** A local YYYY-MM-DD as "9 Nov 2026". */
const date = (day: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))

type Filter = 'all' | 'unlocked' | 'locked'
const LIMIT = 8

/**
 * Every badge in a four-column grid (two rows to start, the rest one click away): filters All · Unlocked · Locked, and
 * `/you#locked` (Close to unlocking's link) opens it on Locked. The head is the card's; on a phone the fold has it.
 */
export function AchievementsBoard({ items }: { items: BoardItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [all, setAll] = useState(false)
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash !== '#locked') return
      setFilter('locked')
      document.getElementById('achievements')?.scrollIntoView({ block: 'start' })
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const unlocked = items.filter((a) => a.unlockedAt).sort((a, b) => b.unlockedAt!.localeCompare(a.unlockedAt!))
  const locked = lockedFirst(items)
  const list = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : [...unlocked, ...locked]
  const visible = all ? list : list.slice(0, LIMIT)
  const xpEarned = unlocked.reduce((s, a) => s + a.xp, 0)

  return (
    <div id="achievements" className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="@max-[39.99rem]:hidden">
          <h2 className="text-heading text-ink">Achievements</h2>
          <p className="mt-0.5 text-small text-ink-3 tabular-nums">{unlocked.length} of {items.length} unlocked · {fmt(xpEarned)} XP from achievements</p>
        </div>
        <div role="group" aria-label="Show" className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
          {([['all', 'All', items.length], ['unlocked', 'Unlocked', unlocked.length], ['locked', 'Locked', locked.length]] as const).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-small font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out-quint active:scale-96 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                filter === k ? 'bg-surface text-ink shadow-1' : 'text-ink-3 hover-fine:text-ink',
              )}
            >
              {label}<span className="text-ink-3 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
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
      <Medallion a={a} size={48} />
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
