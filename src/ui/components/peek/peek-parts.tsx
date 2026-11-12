import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { buttonClass } from '../button'
import { cn } from '../../cn'
import { Skeleton } from '../card'

// Building blocks the peek views share. Server-safe (no state), so /dev/ui and the full pages can use them too.

/** Mono caption above a block, with an optional note on the right. */
export function PeekSection({ label, aside, children, className }: { label: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mt-6', className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-label font-mono uppercase text-ink-3">{label}</h3>
        {aside ? <div className="min-w-0 text-caption text-ink-3 tabular-nums">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** Two to four numbers in an inset well, split by hairlines. */
export function PeekStats({ items }: { items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] }) {
  return (
    <dl className="grid divide-x divide-divider rounded-md bg-surface-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        <div key={s.label} className="min-w-0 px-3 py-3">
          <dt className="truncate text-caption text-ink-3">{s.label}</dt>
          <dd className="num mt-1 text-heading text-ink tabular-nums">{s.value}</dd>
          {s.sub ? <dd className="mt-0.5 truncate text-caption text-ink-3">{s.sub}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** A tinted block for a note or explanation. */
export function PeekNote({ icon: Icon, label, children, tone = 'pill' }: { icon?: LucideIcon; label?: string; children: React.ReactNode; tone?: 'pill' | 'warn' | 'bad' }) {
  const color = { pill: 'var(--pill)', warn: 'var(--warn)', bad: 'var(--bad)' }[tone]
  return (
    <div className="mt-5 rounded-md px-4 py-3 text-small text-ink-2" style={{ background: `color-mix(in oklch, ${color} 10%, transparent)` }}>
      {label ? (
        <p className="mb-1 flex items-center gap-1.5 text-label font-mono uppercase" style={{ color: `color-mix(in oklch, ${color} 70%, var(--ink))` }}>
          {Icon ? <Icon className="size-3.5" strokeWidth={1.5} aria-hidden /> : null}{label}
        </p>
      ) : null}
      {children}
    </div>
  )
}

/** The icon chip in a peek header (the Sheet puts it before the title on a laptop). */
export function PeekIcon({ icon: Icon, color = 'var(--pill)' }: { icon: LucideIcon; color?: string }) {
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md" style={{ color, background: `color-mix(in oklch, ${color} 14%, transparent)` }}>
      <Icon className="size-5" strokeWidth={1.5} />
    </span>
  )
}

/** Pinned to the bottom of the sheet's scroll area: the way to the full page. */
export function PeekFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 -mb-6 flex items-center justify-between gap-3 border-t border-divider bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:-mx-5 lg:-mb-5 lg:px-5 lg:pb-3">
      {children}
    </div>
  )
}

/** "Open full page" and its kin: the primary action of a footer. */
export function PeekOpen({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonClass({ variant: 'primary', size: 'lg' }), 'ml-auto max-lg:flex-1')}>
      {children}<ArrowRight className="size-4" strokeWidth={2} aria-hidden />
    </Link>
  )
}

/** A plain list row: label left, value right. */
export function PeekRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-10 items-center justify-between gap-3 border-b border-divider py-2 text-small last:border-b-0', className)}>
      <span className="min-w-0 text-ink-3">{label}</span>
      <span className="min-w-0 text-right text-ink tabular-nums">{children}</span>
    </div>
  )
}

/** While the item loads: blocks the size of a typical peek, so nothing jumps when it arrives. */
export function PeekSkeleton() {
  return (
    <div aria-busy aria-label="Loading" className="pt-1">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Skeleton className="mt-6 h-24 rounded-md" />
      <Skeleton className="mt-6 h-[170px] rounded-md" />
      <Skeleton className="mt-6 h-16 rounded-md" />
    </div>
  )
}
