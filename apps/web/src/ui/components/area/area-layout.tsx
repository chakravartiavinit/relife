import { connection } from 'next/server'
import { Suspense } from 'react'
import { areaScope, loadAreaKpis, type AreaDef } from '@/core/areas'
import { getUser } from '@/core/user'
import { KpiStrip, Skeleton, type Kpi } from '../card'
import { Ticker } from '../ticker'
import { AreaHeader } from './area-header'
import { AreaLog, AreaTabs } from './area-tabs'

/**
 * The area template: the compact head with its tab row and Log button → headline numbers → the tab body. It lives in a layout, so a tab change only
 * re-renders the body. Every headline number opens a Peek (its metric, or the area's summary when it has none).
 * The headline numbers (`AreaKpiStrip`) are drawn by the tabs after Overview, so the Overview, which carries the same
 * numbers in its targets table, never reads them. Wealth keeps its numbers per tab, and Time puts its in the head (`summary`).
 */
export function AreaLayout({ def, children, right, summary, eyebrow }: { def: AreaDef; children: React.ReactNode; right?: React.ReactNode; summary?: React.ReactNode; /** The line above the title; default "Life · Health". */ eyebrow?: React.ReactNode }) {
  return (
    <>
      <AreaHeader def={def} right={right} summary={summary} eyebrow={eyebrow} tabs={def.tabs.length > 1 ? <AreaTabs def={def} /> : undefined} actions={def.tabs.length > 1 ? <AreaLog def={def} /> : undefined} />
      <div className="@container flex flex-col gap-6">
        {children}
      </div>
    </>
  )
}

/** The strip with its own Suspense: the first block of every template tab after Overview. */
export const AreaKpiStrip = ({ def }: { def: AreaDef }) => <Suspense fallback={<KpiSkeleton />}><AreaKpis def={def} /></Suspense>

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
