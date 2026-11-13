import { connection } from 'next/server'
import { Suspense } from 'react'
import { areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { getUser } from '@/core/user'
import { KpiStrip, Skeleton, type Kpi } from '../card'
import { Ticker } from '../ticker'
import { AreaHeader } from './area-header'
import { AreaTabs } from './area-tabs'

/**
 * The area template: header → tabs → headline numbers → the tab body. It lives in a layout, so a tab change only
 * re-renders the body. Every headline number opens a Peek (its metric, or the area's summary when it has none).
 * Wealth keeps its numbers per tab (`kpis={false}`: Overview, Spending and Portfolio each have their own).
 */
export function AreaLayout({ def, children, kpis = true, right }: { def: AreaDef; children: React.ReactNode; kpis?: boolean; right?: React.ReactNode }) {
  return (
    <>
      <AreaHeader def={def} right={right} />
      {def.tabs.length > 1 ? <AreaTabs def={def} /> : null}
      <div className="flex flex-col gap-6">
        {kpis ? <Suspense fallback={<KpiSkeleton />}><AreaKpis def={def} /></Suspense> : null}
        {children}
      </div>
    </>
  )
}

export const KpiSkeleton = () => <Skeleton className="h-[124px] rounded-lg" />

/** The four headline numbers of an area. Nothing shows for an area with no data yet (the body explains). */
export async function AreaKpis({ def }: { def: AreaDef }) {
  await connection()
  const items = await loadAreaKpis(await getUser(), def.slug)
  if (!items.length) return null
  const fallback = { type: 'brief', id: areaScope(def) } as const
  const kpis: Kpi[] = items.map((k) => ({
    label: k.label, sub: k.sub, tone: k.tone, peek: k.peek ?? fallback,
    value: k.ticker ? <Ticker value={k.ticker.value} currency={k.ticker.currency} /> : k.value,
  }))
  return <KpiStrip items={kpis} />
}
