import { cn } from '../../cn'
import { Skeleton } from './skeleton'

/** A card of rows with a 44px head: a 24px icon square, name, mono count and a right slot. */
export function Group({ icon, name, count, right, now, children }: {
  icon?: React.ReactNode; name: React.ReactNode; count?: React.ReactNode; right?: React.ReactNode
  /** The "Now" group: its icon square turns red. */
  now?: boolean; children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-raised shadow-1">
      <GroupHead icon={icon} name={name} count={count} right={right} now={now} />
      {children}
    </section>
  )
}

export function GroupHead({ icon, name, count, right, now }: { icon?: React.ReactNode; name: React.ReactNode; count?: React.ReactNode; right?: React.ReactNode; now?: boolean }) {
  return (
    <header className="flex h-11 items-center gap-2.5 border-b border-line px-4">
      {icon ? (
        <span aria-hidden className={cn('flex size-6 items-center justify-center rounded-md [&_img]:size-[18px] [&_svg]:size-3.5', now ? 'bg-bad-bg text-bad shadow-[inset_0_0_0_1px_var(--red-line)]' : 'tile-bg')}>{icon}</span>
      ) : null}
      <h3 className="font-semibold">{name}</h3>
      {count !== undefined ? <span className="font-mono text-[12px] text-ink-3">{count}</span> : null}
      {right ? <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-3">{right}</div> : null}
    </header>
  )
}

/**
 * One row: tile, title and sub-line, area, time, XP, action. 64px; `--line` between rows; `--hover` on hover.
 * Overdue turns the time and sub-line red (and says "Overdue"); `next` adds an accent chip. A `menu` replaces
 * area, time and XP on hover or focus (opacity only).
 */
export function ItemRow({ tile, title, sub, area, time, xp, action, tone, menu }: {
  tile?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; area?: React.ReactNode; time?: React.ReactNode; xp?: React.ReactNode
  action?: React.ReactNode; tone?: 'overdue' | 'next'; menu?: React.ReactNode
}) {
  const fade = menu ? 'transition-[opacity] duration-150 group-hover/row:opacity-0 group-focus-within/row:opacity-0' : ''
  return (
    <div
      className={cn(
        'group/row relative grid h-[var(--row)] grid-cols-[48px_minmax(0,1fr)_auto_40px] items-center gap-x-4 pr-3 pl-4 transition-[background-color] duration-150 hover:bg-hover [&+&]:shadow-[inset_0_1px_0_var(--line)]',
        'md:grid-cols-[48px_minmax(0,1fr)_112px_48px_56px_40px]',
      )}
    >
      <div>{tile}</div>
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2">
          <span className="t-row truncate">{title}</span>
          {tone === 'next' ? <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-accent-bg px-1.5 text-[11.5px] font-medium text-accent-text shadow-[inset_0_0_0_1px_var(--accent-line)]">Next</span> : null}
        </div>
        {sub || tone === 'overdue' ? (
          <div className={cn('mt-0.5 flex items-center gap-1.5 truncate text-[12px] leading-4 whitespace-nowrap', tone === 'overdue' ? 'text-bad' : 'text-ink-3')}>
            {tone === 'overdue' ? <span className="font-medium">Overdue{sub ? ' ·' : ''}</span> : null}{sub}
          </div>
        ) : null}
      </div>
      <div className={cn('justify-self-start max-md:hidden', fade)}>{area}</div>
      <div className={cn('text-right font-mono text-[12px]', tone === 'overdue' ? 'text-bad' : 'text-ink-2', fade)}>{time}</div>
      <div className={cn('text-right font-mono text-[12px] text-ink-3 max-md:hidden', fade)}>{xp}</div>
      <div className="relative z-10 flex justify-center">{action}</div>
      {menu ? <div className="pointer-events-none absolute top-1/2 right-14 z-10 -translate-y-1/2 opacity-0 transition-[opacity] duration-150 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 max-md:right-12">{menu}</div> : null}
    </div>
  )
}

export function ItemRowSkeleton() {
  return <div className="flex h-[var(--row)] items-center gap-4 px-4"><Skeleton className="size-12 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div></div>
}
