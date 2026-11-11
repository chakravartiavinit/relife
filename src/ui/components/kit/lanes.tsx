import { cn } from '../../cn'

/** The page body: a wide lane (8 columns) and a narrow "At a glance" lane (4) at 1024+, one column below. */
export function Lanes({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:gap-6', className)}>{children}</div>
}

/** A lane: a 24px head (title, mono count, right slot) over its blocks. A `section`, never an `aside`: the tour finds the rail by `aside`. */
export function Lane({ title, count, right, id, children, className }: {
  title?: React.ReactNode; count?: React.ReactNode; right?: React.ReactNode; id?: string; children: React.ReactNode; className?: string
}) {
  return (
    <section id={id} aria-label={typeof title === 'string' ? title : undefined} className={cn('min-w-0', className)}>
      {title || right ? (
        <div className="flex h-6 items-center justify-between gap-3">
          <h2 className="t-section flex items-center gap-2">
            {title}
            {count !== undefined ? <span className="font-mono text-[12px] font-normal text-ink-3">{count}</span> : null}
          </h2>
          {right ? <div className="flex items-center gap-4 text-[12px] text-ink-3">{right}</div> : null}
        </div>
      ) : null}
      <div className={cn('flex flex-col gap-4', !!(title || right) && 'mt-4')}>{children}</div>
    </section>
  )
}
