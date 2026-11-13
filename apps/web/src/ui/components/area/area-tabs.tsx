import { and, count, eq, inArray } from 'drizzle-orm'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { areaHref, type AreaDef } from '@/core/areas'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { RouteTabs } from '../segment-tabs'
import { LogButton } from './log-button'

const LOG_LABEL: Record<string, string> = {
  health: 'Log health', mind: 'Log mind', skills: 'Log practice', wealth: 'Log spend', hobbies: 'Log practice', people: 'Log catch-up',
}

/** The tab row of an area (`/health`, `/health/trends`...) with the area's log button beside it. The counts stream in. */
export function AreaTabs({ def }: { def: AreaDef }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Suspense fallback={<Row def={def} />}><RowWithCounts def={def} /></Suspense>
      {LOG_LABEL[def.slug] ? <LogButton label={LOG_LABEL[def.slug]} /> : null}
    </div>
  )
}

function Row({ def, counts = {} }: { def: AreaDef; counts?: Record<string, number> }) {
  const tabs = def.tabs.map((t) => ({
    href: areaHref(def, t.segment),
    label: counts[t.segment ?? ''] ? <span className="inline-flex items-baseline gap-1.5">{t.label}<span className="text-caption text-ink-3 tabular-nums">{counts[t.segment!]}</span></span> : t.label,
  }))
  return <RouteTabs tabs={tabs} label={def.title} />
}

/** Routines (active ones of this area) and sources (connected connectors of this area), two counts in two queries. */
async function RowWithCounts({ def }: { def: AreaDef }) {
  await connection()
  const user = await getUser()
  const [[routines], [sources]] = await Promise.all([
    def.category && def.tabs.some((t) => t.segment === 'routines')
      ? db.select({ n: count() }).from(schema.schedules).where(and(
        eq(schema.schedules.userId, user.id), eq(schema.schedules.active, true), eq(schema.schedules.category, def.category), inArray(schema.schedules.kind, ['routine', 'medicine']),
      ))
      : [{ n: 0 }],
    def.connectors.length
      ? db.select({ n: count() }).from(schema.connections).where(and(
        eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), inArray(schema.connections.connectorId, def.connectors),
      ))
      : [{ n: 0 }],
  ])
  return <Row def={def} counts={{ routines: routines.n, sources: sources.n }} />
}
