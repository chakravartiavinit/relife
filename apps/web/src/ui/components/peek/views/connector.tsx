'use client'

import type { ConnectorPeek } from '@/core/peek/types'
import { AppLogo } from '../../app-logo'
import { ConnectorBody, STATUS } from '../../connector-market'
import { usePeekChanged } from '../peek-context'
import { PeekFooter, PeekOpen } from '../peek-parts'

export function connectorHeading(d: ConnectorPeek) {
  const c = d.item
  return { title: c.name, description: c.statusLabel ?? STATUS[c.status].label, icon: <AppLogo id={c.id} category={c.category} size="md" /> }
}

/** One connector: status and recent syncs when connected, the connect form when not. */
export function ConnectorPeekView({ data: d }: { data: ConnectorPeek }) {
  const changed = usePeekChanged()
  return (
    <div className="flex flex-col gap-5">
      <ConnectorBody c={d.item} onDone={changed} />
      {!d.worker.alive && !d.worker.demo && d.item.connected ? <p className="text-caption text-warn">The worker is stopped, so nothing syncs. Start it with npm run dev.</p> : null}
      <PeekFooter><PeekOpen href={`/you/connections#${d.item.id}`}>Open Connections</PeekOpen></PeekFooter>
    </div>
  )
}
