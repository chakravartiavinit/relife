import { ChevronDown } from 'lucide-react'
import { cn } from '../cn'

/**
 * A secondary section that folds away, for phones: a native `<details>`, so it works without script and from the
 * keyboard. Closed it shows the title and one line of what is inside ("Review due", "3 done · 2 to go"); open it
 * shows the body. Only the chevron moves (no height or fade animation).
 *
 * `inline` shows the body as a normal section from the 8-column tier up and hides the summary row, so the same markup
 * is a fold on a phone and plain content on a tablet or laptop. It needs a `PageGrid` (or any `@container`) around
 * it, and a browser with `::details-content`; elsewhere it stays a fold.
 *
 * `card` draws the fold as a card (the summary row is the card's header), for a fold that is a whole block.
 */
export function Fold({ title, summary, defaultOpen = false, inline = false, card = false, children, className }: {
  title: React.ReactNode
  /** One line shown under the title while closed. */
  summary?: React.ReactNode
  defaultOpen?: boolean
  inline?: boolean
  card?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <details
      open={defaultOpen}
      data-fold-inline={inline ? '' : undefined}
      className={cn(
        'group/fold',
        // The shared fade on `details::details-content` (globals.css) is off here: a fold moves only its chevron.
        '[&::details-content]:opacity-100 [&::details-content]:transition-none',
        card && 'rounded-lg bg-surface shadow-1',
        className,
      )}
    >
      <summary
        className={cn(
          // 44px tall at least, so it is a comfortable tap on a phone. The browser's own marker is hidden.
          'flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md py-2 select-none [&::-webkit-details-marker]:hidden',
          'transition-colors duration-150 ease-out-quint hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-pill',
          card && 'px-5 py-3',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-heading text-ink">{title}</span>
          {summary ? <span className="block truncate text-small text-ink-3 group-open/fold:hidden">{summary}</span> : null}
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.5}
          className="size-4 shrink-0 text-ink-3 transition-transform duration-150 ease-out-quint group-open/fold:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className={cn('pt-1', card && 'px-5 pb-5')}>{children}</div>
    </details>
  )
}
