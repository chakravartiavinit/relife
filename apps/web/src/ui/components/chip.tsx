import { cn } from '../cn'

/** The chip's look, for a filter that is a link (`?filter=`): `<Link className={chipClass({ selected })}>`. */
export function chipClass({ selected = false, className }: { selected?: boolean; className?: string } = {}) {
  return cn(
    'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-label whitespace-nowrap select-none',
    'transition-[background-color,color,scale] duration-150 ease-out-quint active:scale-97',
    "relative after:absolute after:inset-[-8px] after:content-['']",
    selected ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover-fine:bg-surface-3 hover-fine:text-ink',
    className,
  )
}

/**
 * A filter chip, and only for filters (an area, a period): ink when selected, a well otherwise, with an optional count.
 * A status is a `StatusWord`, never a chip. Pass `selected`; the rest is a button's props.
 */
export function Chip({ selected = false, count, className, children, type = 'button', ...props }: { selected?: boolean; count?: React.ReactNode } & React.ComponentProps<'button'>) {
  return (
    <button type={type} aria-pressed={selected} className={chipClass({ selected, className })} {...props}>
      {children}
      {count != null ? <span className={cn('font-normal', selected ? 'opacity-70' : 'text-ink-3')}>{count}</span> : null}
    </button>
  )
}
