import { cn } from '../cn'

/**
 * The compact head every page opens with (`PageHeader`, `AreaHeader`), not a card:
 *
 *   [capsule] ▮ LABEL                               summary (lines up with the right column)
 *             Title
 *             one brief line, Why?
 *   Tab · Tab · Tab                                              actions (Log health, New goal)
 *
 * The halftone sits in the top-right corner behind the summary. It has its own grid of 12 columns that follows the
 * page's `PageGrid` (container queries on the head itself), so the summary is the same width as the rail below:
 * 4 of 12 from 960px, 5 of 12 from 640px. On a phone it is one column: with tabs, the actions move up beside the title (make them an
 * icon button there), without tabs they wrap under the brief; the summary goes under the brief and the tabs row scrolls sideways.
 */
export function PageHead({ capsule, label, title, brief, summary, tabs, actions, tone = 'var(--pill)', className }: {
  capsule?: React.ReactNode
  /** The mono `SystemLabel`. */
  label?: React.ReactNode
  title: React.ReactNode
  /** One line under the title, with its Why? link. */
  brief?: React.ReactNode
  /** The right-hand block: the level bar, today's numbers, "4 of 6 areas". */
  summary?: React.ReactNode
  /** An underline `RouteTabs` row. */
  tabs?: React.ReactNode
  /** Page actions. At the right end of the tabs row (beside the title on a phone); without tabs, in the head's right column. */
  actions?: React.ReactNode
  /** The area's colour for the halftone. */
  tone?: string
  className?: string
}) {
  const act = actions ? (
    <div
      className={cn(
        'flex items-center gap-2',
        // With tabs a phone puts the actions beside the title (an icon button); without, they wrap under the brief.
        tabs ? 'col-start-2 row-start-1 self-start grid-md:self-center grid-md:py-1' : cn('col-span-full flex-wrap grid-md:col-[8/13] grid-md:justify-end grid-md:self-center', summary ? 'grid-md:row-start-2' : 'grid-md:row-start-1'),
      )}
    >
      {actions}
    </div>
  ) : null
  return (
    <header className={cn('@container relative isolate mb-6', className)}>
      <div aria-hidden className="halftone -z-10 top-0 right-0 h-32 w-80" style={{ '--tone': tone } as React.CSSProperties} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-4 grid-md:grid-cols-12">
        <div className={cn('col-start-1 row-start-1 flex min-w-0 items-center gap-4', !(actions && tabs) && 'col-span-2', summary ? 'grid-md:col-[1/8] grid-lg:col-[1/9]' : 'grid-md:col-[1/13]')}>
          {capsule}
          <div className="min-w-0">
            {label}
            <h1 className="mt-0.5 font-display text-title text-ink grid-md:text-display">{title}</h1>
            {brief ? <p className="mt-1 max-w-[60ch] text-body text-ink-2">{brief}</p> : null}
          </div>
        </div>
        {summary ? <div className="col-span-full min-w-0 grid-md:col-[8/13] grid-md:row-start-1 grid-md:self-center grid-lg:col-[9/13]">{summary}</div> : null}
        {tabs ? (
          // A phone has no box here (`contents`): the tabs take a row of the head's grid and the actions sit beside the title.
          <div className="contents grid-md:col-span-full grid-md:grid grid-md:grid-cols-[minmax(0,1fr)_auto] grid-md:items-end grid-md:border-b grid-md:border-divider">
            <div className="col-span-full min-w-0 border-b border-divider grid-md:col-span-1 grid-md:border-b-0">{tabs}</div>
            {act}
          </div>
        ) : act}
      </div>
    </header>
  )
}
