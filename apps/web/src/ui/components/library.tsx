import { inArray, desc } from 'drizzle-orm'
import { BookOpen, Bookmark, ChevronRight, GraduationCap, SquarePlay, Tv, type LucideIcon } from 'lucide-react'
import { db, schema as tables } from '@/db'
import type { schema } from '@/db'
import { LIBRARY, type LibraryKind } from '@/domain/activity'
import { formatMoney } from '@/domain/money'
import { getUser } from '@/core/user'
import { KIND_COLOR } from '../activity-colors'
import { BrandLogo } from './brand-logo'
import { Capsule } from './capsule'
import { LearningActions } from './forms/learning-forms'
import { LibraryMenu } from './library-menu'
import { cn } from '../cn'
import { isWebUrl } from '@/domain/text'

// Library cards: courses, books, shows and video series, each with its cover picture (saved locally from
// the page), where you are in it, time spent, when you last opened it, and the episodes or lessons watched.

type Item = typeof schema.learningItems.$inferSelect
type Episode = typeof schema.libraryEpisodes.$inferSelect

export const LIBRARY_ICON: Record<LibraryKind, LucideIcon> = { course: GraduationCap, book: BookOpen, show: Tv, video: SquarePlay, other: Bookmark }
const UNIT: Record<LibraryKind, string> = { course: 'lessons', book: 'chapters', show: 'episodes', video: 'videos', other: 'parts' }

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`)
function ago(d: Date | null) {
  if (!d) return null
  const m = Math.round((Date.now() - d.getTime()) / 60_000)
  return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** `compact` draws each item as one row (Time's library, beside the top sites) instead of a cover card. */
export async function LibraryGrid({ items, empty, compact = false }: { items: Item[]; empty?: React.ReactNode; compact?: boolean }) {
  if (!items.length) return <>{empty ?? null}</>
  const { timezone } = await getUser()
  const eps = await db.select().from(tables.libraryEpisodes).where(inArray(tables.libraryEpisodes.itemId, items.map((i) => i.id))).orderBy(desc(tables.libraryEpisodes.lastAt))
  const byItem = new Map<string, Episode[]>()
  for (const e of eps) byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), e])
  if (compact) {
    return (
      <ul className="flex flex-col divide-y divide-divider border-t border-divider">
        {items.map((i) => <LibraryRow key={i.id} item={i} episodes={byItem.get(i.id) ?? []} timeZone={timezone} />)}
      </ul>
    )
  }
  return (
    // Columns follow the card's own width (container query), so a half-width card shows one full-width item
    // instead of a narrow one with empty space beside it.
    <div className="@container">
      <ul className="grid gap-4 @xl:grid-cols-2">
        {items.map((i) => <LibraryCard key={i.id} item={i} episodes={byItem.get(i.id) ?? []} timeZone={timezone} />)}
      </ul>
    </div>
  )
}

function LibraryCard({ item: i, episodes, timeZone }: { item: Item; episodes: Episode[]; timeZone: string }) {
  const kind = i.kind as LibraryKind
  const color = KIND_COLOR[LIBRARY[kind].counts]
  const Icon = LIBRARY_ICON[kind]
  const current = (i.meta as { current?: string }).current
  const last = ago(i.lastActiveAt)
  const photo = !!i.image && !(i.meta as { iconOnly?: boolean }).iconOnly
  return (
    <li className={cn('flex flex-col overflow-hidden rounded-[18px] bg-surface shadow-[0_0_0_1px_var(--hairline)]', i.status === 'done' && 'opacity-70')}>
      {/* Cover: the saved picture, or the site's logo on a tint of what the time counts as. */}
      {/* A real picture gets the wide cover; a logo on a tint needs far less room. */}
      <div className={cn('relative overflow-hidden', photo ? 'aspect-[16/7]' : 'h-28')} style={{ background: `color-mix(in oklch, ${color} 12%, var(--surface-2))` }}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local file from /api/library
          <img src={`/api/library/${i.id}/image`} alt="" className="size-full object-cover" />
        ) : i.image ? (
          // Only the site's icon: show it as a logo tile on the tinted cover.
          <div className="grid size-full place-items-center">
            <div aria-hidden className="halftone inset-0" style={{ '--tone': color } as React.CSSProperties} />
            <span className="relative grid size-16 place-items-center overflow-hidden rounded-[18px] bg-white p-2 shadow-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local file from /api/library */}
              <img src={`/api/library/${i.id}/image`} alt="" className="size-full object-contain outline-none" />
            </span>
          </div>
        ) : (
          <div className="grid size-full place-items-center">
            <div aria-hidden className="halftone inset-0" style={{ '--tone': color } as React.CSSProperties} />
            <BrandLogo name={i.provider ?? i.title} size="lg" className="relative shadow-2" />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-surface/90 px-2.5 text-caption font-medium text-ink shadow-1 backdrop-blur-sm">
          <Icon className="size-3.5" strokeWidth={2} style={{ color }} aria-hidden />{LIBRARY[kind].label}
        </span>
        {i.status === 'done' ? <span className="absolute top-2.5 right-2.5 inline-flex h-7 items-center rounded-full bg-good px-2.5 text-caption font-medium text-white shadow-1">Finished</span> : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-heading leading-snug font-medium text-ink">
              {isWebUrl(i.url) ? <a href={i.url} target="_blank" rel="noreferrer" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{i.title}</a> : i.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 truncate text-caption text-ink-3">
              {i.provider ? <><BrandLogo name={i.provider} className="size-5 rounded-[6px] text-caption" /><span className="truncate">{i.provider}</span></> : null}
            </p>
          </div>
          <div className="-me-2 -mt-1"><LibraryMenu item={{ id: i.id, title: i.title, kind, progressTotal: i.progressTotal, status: i.status }} /></div>
        </div>

        {episodes[0] ? (
          <p className="flex min-w-0 items-center gap-1.5 text-caption text-ink-2">
            <span className="shrink-0 text-ink-3">Last watched</span>
            {epLabel(episodes[0]) ? <span className="shrink-0 font-medium text-ink tabular-nums">{epLabel(episodes[0])}</span> : null}
            <span className="truncate">{episodes[0].title}</span>
            {pct(episodes[0]) != null ? <span className="shrink-0 text-ink-3 tabular-nums">· {pct(episodes[0])}%</span> : null}
          </p>
        ) : current ? <p className="truncate text-caption text-ink-2"><span className="text-ink-3">Now: </span>{current}</p> : null}

        {i.progressTotal ? (
          <div className="flex items-center gap-3">
            <Capsule value={i.progressDone} max={i.progressTotal} color={color} label={`${i.title}: ${i.progressDone} of ${i.progressTotal} ${UNIT[kind]}`} />
            <span className="shrink-0 text-caption text-ink-3 tabular-nums">{i.progressDone}/{i.progressTotal} {UNIT[kind]}</span>
          </div>
        ) : null}

        {episodes.length ? <EpisodeLog episodes={episodes} unit={UNIT[kind]} color={color} timeZone={timeZone} /> : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="text-caption text-ink-3 tabular-nums">
            <span className="font-medium text-ink">{hm(i.minutesLogged)}</span> spent{last ? ` · ${last}` : ''}
            {i.cost && i.currency && i.minutesLogged >= 60 ? ` · ${formatMoney(i.cost / (i.minutesLogged / 60), i.currency)}/h` : ''}
          </span>
          <LearningActions id={i.id} title={i.title} hasModules={!!i.progressTotal && i.status !== 'done'} />
        </div>
      </div>
    </li>
  )
}

/** One library item as a row: logo, title, where it is from and the time spent, how far along, and the one-tap actions. */
function LibraryRow({ item: i, episodes, timeZone }: { item: Item; episodes: Episode[]; timeZone: string }) {
  const kind = i.kind as LibraryKind
  const color = KIND_COLOR[LIBRARY[kind].counts]
  const last = ago(i.lastActiveAt)
  return (
    <li className={cn('py-3', i.status === 'done' && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <BrandLogo name={i.provider ?? i.title} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-medium text-ink">
            {isWebUrl(i.url) ? <a href={i.url} target="_blank" rel="noreferrer" className="rounded-sm hover-fine:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">{i.title}</a> : i.title}
          </h3>
          <p className="truncate text-caption text-ink-3 tabular-nums">
            {[i.provider, `${hm(i.minutesLogged)} spent${last ? ` · ${last}` : ''}`, i.cost && i.currency && i.minutesLogged >= 60 ? `${formatMoney(i.cost / (i.minutesLogged / 60), i.currency)}/h` : null].filter(Boolean).join(' · ')}
          </p>
          {i.progressTotal ? (
            <div className="mt-2 flex items-center gap-3">
              <Capsule size="sm" value={i.progressDone} max={i.progressTotal} color={color} label={`${i.title}: ${i.progressDone} of ${i.progressTotal} ${UNIT[kind]}`} />
              <span className="shrink-0 text-caption text-ink-3 tabular-nums">{i.progressDone}/{i.progressTotal} {UNIT[kind]}</span>
            </div>
          ) : null}
        </div>
        <LibraryMenu item={{ id: i.id, title: i.title, kind, progressTotal: i.progressTotal, status: i.status }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 ps-[52px]">
        <LearningActions id={i.id} title={i.title} hasModules={!!i.progressTotal && i.status !== 'done'} />
      </div>
      {episodes.length ? <div className="ps-[52px]"><EpisodeLog episodes={episodes} unit={UNIT[kind]} color={color} timeZone={timeZone} /></div> : null}
    </li>
  )
}

/** "S2 E5", "E5", or nothing when the episode has no number. */
const epLabel = (e: Episode) => (e.number == null ? null : `${e.season && e.season > 1 ? `S${e.season} ` : ''}E${e.number}`)
/** How far into the episode you got, as a percentage of its length. */
const pct = (e: Episode) => (e.durationSec && e.positionSec != null ? Math.min(100, Math.round((e.positionSec / e.durationSec) * 100)) : null)
const mins = (sec: number | null) => (sec == null ? null : sec >= 3600 ? `${Math.floor(sec / 3600)}h ${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}m` : `${Math.max(1, Math.round(sec / 60))}m`)

/** Everything watched of one item, newest first: number, name, length, how far in, time spent, when. */
function EpisodeLog({ episodes, unit, color, timeZone }: { episodes: Episode[]; unit: string; color: string; timeZone: string }) {
  const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone })
  const total = episodes.reduce((a, e) => a + e.watchedSec, 0)
  return (
    <details className="group -mx-1 rounded-[12px]">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-1 text-caption font-medium text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-[rotate] duration-150 ease-out-quint group-open:rotate-90" strokeWidth={2} aria-hidden />
        {episodes.length} {episodes.length === 1 ? unit.replace(/s$/, '') : unit} watched
        <span className="font-normal text-ink-3 tabular-nums">· {mins(total)}</span>
      </summary>
      <ol className="mt-1 flex max-h-72 flex-col overflow-y-auto overscroll-contain px-1">
        {episodes.map((e) => {
          const p = pct(e)
          return (
            <li key={e.id} className="flex items-center gap-3 border-t border-divider py-2 first:border-t-0">
              <span className="w-12 shrink-0 text-caption font-medium text-ink-2 tabular-nums">{epLabel(e) ?? '·'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small text-ink">{e.title ?? 'Untitled'}</span>
                <span className="mt-0.5 flex items-center gap-2 text-caption text-ink-3 tabular-nums">
                  {p != null ? (
                    <span aria-label={`${p}% watched`} className="h-1 w-14 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full" style={{ width: `${p}%`, background: p >= 90 ? 'var(--good)' : color }} />
                    </span>
                  ) : null}
                  {[p != null ? (p >= 90 ? 'Finished' : `${p}%`) : null, e.durationSec ? `of ${mins(e.durationSec)}` : null, `${mins(e.watchedSec)} spent`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-caption text-ink-3 tabular-nums">{day.format(e.lastAt)}</span>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
