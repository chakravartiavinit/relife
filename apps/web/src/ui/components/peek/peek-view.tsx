'use client'

import type { PeekData } from '@/core/peek/types'
import { connectorHeading, ConnectorPeekView } from './views/connector'
import { goalHeading, GoalPeekView } from './views/goal'
import { insightHeading, InsightPeekView } from './views/insight'
import { merchantHeading, MerchantPeekView, txnHeading, TxnPeekView } from './views/money'
import { metricHeading, MetricPeekView } from './views/metric'
import { personHeading, PersonPeekView, questHeading, QuestPeekView } from './views/people'
import { routineHeading, RoutinePeekView } from './views/routine'
import { briefHeading, BriefPeekView, syncHeading, SyncPeekView } from './views/status'

/** The Sheet's title, description and icon for an item. */
export function peekHeading(d: PeekData): { title: string; description?: string; icon?: React.ReactNode } {
  switch (d.type) {
    case 'metric': return metricHeading(d)
    case 'routine': return routineHeading(d)
    case 'goal': return goalHeading(d)
    case 'txn': return txnHeading(d)
    case 'merchant': return merchantHeading(d)
    case 'insight': return insightHeading(d)
    case 'connector': return connectorHeading(d)
    case 'person': return personHeading(d)
    case 'quest': return questHeading(d)
    case 'sync': return syncHeading(d)
    case 'brief': return briefHeading(d)
  }
}

/** The body for an item. Presentational: it takes the JSON from /api/peek, so /dev/ui can draw it from fixtures. */
export function PeekView({ data }: { data: PeekData }) {
  switch (data.type) {
    case 'metric': return <MetricPeekView data={data} />
    case 'routine': return <RoutinePeekView data={data} />
    case 'goal': return <GoalPeekView data={data} />
    case 'txn': return <TxnPeekView data={data} />
    case 'merchant': return <MerchantPeekView data={data} />
    case 'insight': return <InsightPeekView data={data} />
    case 'connector': return <ConnectorPeekView data={data} />
    case 'person': return <PersonPeekView data={data} />
    case 'quest': return <QuestPeekView data={data} />
    case 'sync': return <SyncPeekView data={data} />
    case 'brief': return <BriefPeekView data={data} />
  }
}
