import { Skeleton } from '../card'

/** An area Overview while the page loads: the lead chart and the rows beside the rail (routines, a connection, two link rows). */
export function OverviewSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-md:grid-cols-8 grid-lg:grid-cols-12">
        <Skeleton className="h-[460px] rounded-lg col-span-full grid-lg:col-span-8" />
        <Skeleton className="h-[640px] rounded-lg col-span-full grid-lg:col-span-4 grid-lg:row-span-2" />
        <Skeleton className="h-[460px] rounded-lg col-span-full grid-lg:col-span-8" />
      </div>
    </div>
  )
}
