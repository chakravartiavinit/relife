import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { ConnectorMarket } from '@/ui/components/connector-market'
import { PageTabs } from '@/ui/components/kit/page-tabs'
import { TABS } from '@/ui/nav-model'
import { loadConnectors } from './load'

export const metadata: Metadata = { title: 'Sources' }

export default function SourcesPage() {
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Sources"
        description="Data sources, Telegram and AI models. You bring the keys: they’re encrypted in your local database, and nothing syncs until you connect it."
        tabs={<PageTabs label="Sources" current="/sources" items={TABS['/sources']} />}
      />
      <Suspense fallback={
        <div className="flex flex-col gap-10">
          <Skeleton className="h-8 w-72 rounded-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-[18px]" />)}</div>
        </div>
      }>
        <Connected />
      </Suspense>
    </>
  )
}

async function Connected() {
  const { items, worker } = await loadConnectors()
  return <ConnectorMarket items={items} worker={worker} mode="connected" />
}
