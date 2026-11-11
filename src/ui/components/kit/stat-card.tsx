import { cn } from '../../cn'
import { Skeleton } from './skeleton'

/** A hero stat: label and value up top (a small 3D picture beside them), a WeekStrip, SplitBar or Bar below. */
export function StatCard({ label, art, value, unit, sub, children, className }: {
  label: React.ReactNode; art?: string; value: React.ReactNode; unit?: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string
}) {
  return (
    <div className={cn('stat-bg flex min-h-[168px] flex-col rounded-lg p-4', className)}>
      <div className="grid items-center gap-x-3" style={{ gridTemplateColumns: art ? '40px minmax(0,1fr)' : 'minmax(0,1fr)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local PNG */}
        {art ? <img src={art} alt="" width={40} height={40} className="size-10 outline-none" /> : null}
        <div className="min-w-0">
          <div className="t-meta">{label}</div>
          <div className="flex items-baseline gap-1.5 text-[20px] leading-6 font-semibold tracking-[-0.02em] tabular-nums">
            {value}
            {unit ? <small className="text-[13px] font-normal tracking-normal text-ink-2">{unit}</small> : null}
          </div>
        </div>
      </div>
      {sub ? <div className="t-meta mt-2">{sub}</div> : null}
      {children ? <div className="mt-auto pt-3">{children}</div> : null}
    </div>
  )
}

export function StatCardSkeleton() {
  return <Skeleton className="min-h-[168px] rounded-lg" />
}
