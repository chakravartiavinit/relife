import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { PeekRef } from '@/domain/peek'
import type { Status } from '@/domain/status-of'
import { cn } from '../cn'
import { PeekLink } from './peek/peek-link'
import { Picture, type PictureSize } from './picture'
import type { PictureRef } from '../picture'
import { StatusWord } from './status-word'

/**
 * A list row where the state matters more than the figure: a picture, the name, one plain line, a status word and a
 * chevron. The figures live in the Peek it opens (`peek`) or the page it goes to (`href`). One picture size per list
 * (`pictureSize`, default 32; 40 for a lead list), so the pictures line up in a column. Rows divide themselves; put them
 * in a plain `div`. With neither `peek` nor `href` the row is plain (no chevron, no hover).
 *
 * `picture` is any `Picture` ref: a brand logo, a connector logo, a coin, a routine, hobby, category or area picture,
 * a library cover. With no `picture` the slot is left out. Use `trailing` for a control that replaces the chevron.
 *
 * `under` is a second line across the text and status columns (a progress bar). `meta` is a column between the text and
 * the status word (a level bar) from a 448px container up; below that, put the same thing in `under`.
 */
export function StatusRow({ picture, pictureSize = 32, name, line, status, value, peek, href, trailing, meta, under, underClass, selected, onSelect, className }: {
  picture?: PictureRef
  pictureSize?: Exclude<PictureSize, 20 | 56>
  name: React.ReactNode
  /** One line under the name; on a laptop it is cut with an ellipsis, on a phone it may take two lines. */
  line?: React.ReactNode
  status?: Status
  /** A figure on the right when the row ranks money or counts (a payee, a renewal) instead of carrying a status; a status wins when both are given. */
  value?: React.ReactNode
  peek?: PeekRef
  href?: string
  trailing?: React.ReactNode
  meta?: React.ReactNode
  under?: React.ReactNode
  /** Classes for the `under` line, to hide it where `meta` shows (`@md:hidden`). */
  underClass?: string
  /** A row that picks something (the tracker whose chart shows): a button, not a link. Give both; `selected` shades the row. */
  selected?: boolean
  onSelect?: () => void
  className?: string
}) {
  // No aria-label: it would replace the row's own text (its line, figure and bar). Screen readers read the visible
  // name, line and status word, then this hint.
  const hint = peek || href ? '. Open details' : onSelect ? '. Show its chart' : ''
  const box = cn(
    '-mx-2 grid min-h-14 items-center gap-x-3 rounded-md px-2 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)]',
    pictureSize === 40 ? 'grid-cols-[40px_minmax(0,1fr)_auto_auto]' : 'grid-cols-[32px_minmax(0,1fr)_auto_auto]',
    !picture && 'grid-cols-[minmax(0,1fr)_auto_auto]',
    !!meta && (picture ? (pictureSize === 40 ? '@md:grid-cols-[40px_minmax(0,1fr)_9.5rem_5.5rem_auto]' : '@md:grid-cols-[32px_minmax(0,1fr)_9.5rem_5.5rem_auto]') : '@md:grid-cols-[minmax(0,1fr)_9.5rem_5.5rem_auto]'),
    (peek || href || onSelect) && 'transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill',
    selected && 'bg-surface-2',
    className,
  )
  const body = (
    <>
      {picture ? <Picture {...picture} size={pictureSize} /> : null}
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink max-sm:line-clamp-2 sm:truncate">{name}</span>
        {line ? <span className="block text-small text-ink-3 max-sm:line-clamp-2 sm:truncate">{line}</span> : null}
      </span>
      {meta ? <div className="hidden min-w-0 @md:block">{meta}</div> : null}
      <span className={cn('justify-self-end', !status && 'text-body font-medium text-ink tabular-nums')}>{status ? <StatusWord status={status} /> : value}</span>
      {trailing ?? ((peek || href || onSelect) ? <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 text-ink-3" /> : <span aria-hidden />)}
      {under ? <div className={cn('mt-1.5 block min-w-0 col-end-[-1]', picture ? 'col-start-2' : 'col-start-1', underClass)}>{under}</div> : null}
      {/* Last, so it is read after the status word; sr-only is absolute, so it takes no grid cell. */}
      {hint ? <span className="sr-only">{hint}</span> : null}
    </>
  )
  if (onSelect) return <button type="button" aria-pressed={selected} onClick={onSelect} className={cn(box, 'w-[calc(100%+1rem)] text-start')}>{body}</button>
  if (peek) return <PeekLink to={peek} className={box}>{body}</PeekLink>
  if (href) return <Link href={href} className={box}>{body}</Link>
  return <div className={box}>{body}</div>
}
