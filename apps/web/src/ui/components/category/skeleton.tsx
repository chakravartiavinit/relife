import { Skeleton } from '../card'

/** KPI strip plus a grid of cards: the shape every area page loads into. */
export function CategorySkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-[124px] rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => <Skeleton key={i} className="h-[330px] rounded-lg" />)}
      </div>
    </div>
  )
}
