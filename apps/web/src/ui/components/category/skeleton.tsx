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

/** An area Overview while the page loads: the targets table and the rail side by side, then All metrics (a closed fold on a phone). */
export function OverviewSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-md:grid-cols-8 grid-lg:grid-cols-12">
        <Skeleton className="h-[540px] rounded-lg col-span-full grid-lg:col-span-8" />
        <Skeleton className="h-[640px] rounded-lg col-span-full grid-lg:col-span-4 grid-lg:row-span-2" />
        <Skeleton className="h-[360px] rounded-lg col-span-full grid-lg:col-span-8" />
        <Skeleton className="h-[68px] rounded-lg col-span-full grid-md:h-[360px]" />
      </div>
    </div>
  )
}
