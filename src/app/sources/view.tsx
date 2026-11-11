import { Suspense } from 'react'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { ConnectorMarket } from '@/ui/components/connector-market'
import { PageTabs } from '@/ui/components/kit/page-tabs'
import { TABS } from '@/ui/nav-model'
import { loadConnectors } from './load'

/** /sources (connected) and /sources/browse (catalogue): one header and tabs, a different slice of the same list. */
export function SourcesView({ mode }: { mode: 'connected' | 'browse' }) {
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Sources"
        description="Data sources, Telegram and AI models. You bring the keys: they’re encrypted in your local database, and nothing syncs until you connect it."
        tabs={<PageTabs label="Sources" current={mode === 'browse' ? '/sources/browse' : '/sources'} items={TABS['/sources']} />}
      />
      <Suspense fallback={
        <div className="flex flex-col gap-10">
          <Skeleton className="h-8 w-72 rounded-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: mode === 'browse' ? 9 : 6 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-[18px]" />)}</div>
        </div>
      }>
        <Market mode={mode} />
      </Suspense>
    </>
  )
}

async function Market({ mode }: { mode: 'connected' | 'browse' }) {
  const { items, worker } = await loadConnectors()
  return <ConnectorMarket items={items} worker={worker} mode={mode} />
}
