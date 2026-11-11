import { cn } from '../../cn'
import { Skeleton } from './skeleton'

export type KeyCardItem = { art?: string; label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; viz?: React.ReactNode }

/** One headline number: a small picture, label, value, a line under it and an optional mini chart. */
export function KeyCard({ art, label, value, sub, viz, className }: KeyCardItem & { className?: string }) {
  return (
    <div className={cn('relative flex min-h-[112px] min-w-0 flex-col rounded-lg bg-raised p-4 shadow-1', className)}>
      <div className="flex items-center gap-2 text-[12px] leading-5 text-ink-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local PNG */}
        {art ? <img src={art} alt="" width={20} height={20} className="size-5 outline-none" /> : null}
        {label}
      </div>
      <div className="t-num mt-1">{value}</div>
      {sub ? <div className="t-meta mt-auto pt-1">{sub}</div> : null}
      {viz ? <div className="absolute top-9 right-4">{viz}</div> : null}
    </div>
  )
}

/** Four equal cards on the 12-column grid: 4 across at 1024+, 2 by 2 below, one column on a phone. */
export function KeyCards({ items, className }: { items: KeyCardItem[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4 lg:gap-6', className)}>
      {items.map((it, i) => <KeyCard key={i} {...it} />)}
    </div>
  )
}

export function KeyCardsSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="min-h-[112px] rounded-lg" />)}
    </div>
  )
}
