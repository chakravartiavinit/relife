import { cn } from '../../cn'

/**
 * The band at the top of every page: a mono meta line, title, lede, pills, and on wide pages a centre
 * (a Ring) and side (StatCards). 3 x 360px columns at 1024+, stacked below. `tabs` (a PageTabs) sits just under it.
 * The band bleeds to the edges of the page column through the negative margins, which match `main` padding in layout.tsx.
 */
export function Hero({ meta, title, lede, pills, actions, art, center, side, tabs, className }: {
  meta?: React.ReactNode; title: React.ReactNode; lede?: React.ReactNode; pills?: React.ReactNode; actions?: React.ReactNode
  /** A tile or logo beside the title (area pages). */
  art?: React.ReactNode
  center?: React.ReactNode; side?: React.ReactNode; tabs?: React.ReactNode; className?: string
}) {
  const wide = !!(center || side)
  return (
    <div className={cn('-mx-5 mb-8 sm:-mx-8 lg:-mx-9 lg:-mt-9', className)}>
      <header className={cn('hero-bg relative isolate overflow-hidden border-b border-line', !!tabs && 'border-b-0')}>
        <span aria-hidden className="hero-edge absolute inset-x-0 top-0 h-px" />
        <div
          className={cn(
            'mx-auto grid max-w-[1200px] gap-6 px-5 py-6 sm:px-8 lg:px-9',
            wide ? 'lg:min-h-[var(--hero-h)] lg:grid-cols-[repeat(3,minmax(0,360px))] lg:items-center lg:py-0' : 'lg:py-8',
          )}
        >
          <div className={cn('flex min-w-0 gap-4', !wide && 'flex-wrap items-end justify-between')}>
            <div className="flex min-w-0 gap-4">
              {art}
              <div className="min-w-0">
                {meta ? <div className="flex items-center gap-2 font-mono text-[12px] leading-4 text-ink-3">{meta}</div> : null}
                <h1 className="t-hero mt-2">{title}</h1>
                {lede ? <p className={cn('t-lede mt-2', wide ? 'max-w-[352px]' : 'max-w-[60ch]')}>{lede}</p> : null}
                {pills ? <div aria-label="Check first" className="mt-4 flex flex-wrap gap-2">{pills}</div> : null}
              </div>
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
          {center ? <div className="min-w-0">{center}</div> : null}
          {side ? <div className={cn('flex min-w-0 flex-col gap-3', !center && 'lg:col-start-3')}>{side}</div> : null}
        </div>
      </header>
      {tabs ? <div className="border-b border-line"><div className="mx-auto max-w-[1200px] px-5 sm:px-8 lg:px-9">{tabs}</div></div> : null}
    </div>
  )
}

export function HeroSkeleton() {
  return <div className="-mx-5 mb-8 h-[var(--hero-h)] animate-pulse border-b border-line bg-fill-soft sm:-mx-8 lg:-mx-9 lg:-mt-9" />
}
