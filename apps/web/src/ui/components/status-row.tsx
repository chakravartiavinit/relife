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
 */
export function StatusRow({ picture, pictureSize = 32, name, line, status, peek, href, trailing, className }: {
  picture?: PictureRef
  pictureSize?: Exclude<PictureSize, 20 | 56>
  name: React.ReactNode
  /** One line under the name; on a laptop it is cut with an ellipsis, on a phone it may take two lines. */
  line?: React.ReactNode
  status?: Status
  peek?: PeekRef
  href?: string
  trailing?: React.ReactNode
  className?: string
}) {
  const label = typeof name === 'string' ? `${name}${status ? `, ${status.toLowerCase()}` : ''}${peek || href ? '. Open details' : ''}` : undefined
  const box = cn(
    '-mx-2 grid min-h-14 items-center gap-x-3 rounded-md px-2 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)]',
    pictureSize === 40 ? 'grid-cols-[40px_minmax(0,1fr)_auto_16px]' : 'grid-cols-[32px_minmax(0,1fr)_auto_16px]',
    !picture && 'grid-cols-[minmax(0,1fr)_auto_16px]',
    (peek || href) && 'transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill',
    className,
  )
  const body = (
    <>
      {picture ? <Picture {...picture} size={pictureSize} /> : null}
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink max-sm:line-clamp-2 sm:truncate">{name}</span>
        {line ? <span className="block text-small text-ink-3 max-sm:line-clamp-2 sm:truncate">{line}</span> : null}
      </span>
      <span className="justify-self-end">{status ? <StatusWord status={status} /> : null}</span>
      {trailing ?? ((peek || href) ? <ChevronRight aria-hidden strokeWidth={1.5} className="size-4 text-ink-3" /> : <span aria-hidden />)}
    </>
  )
  if (peek) return <PeekLink to={peek} aria-label={label} className={box}>{body}</PeekLink>
  if (href) return <Link href={href} aria-label={label} className={box}>{body}</Link>
  return <div className={box}>{body}</div>
}
