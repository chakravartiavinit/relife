import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { ConnectorMarket } from '@/ui/components/connector-market'
import { loadConnectorItems } from '@/core/connector-items'
import { requestOrigin } from '@/core/auth/trust'
import { env } from '@/core/env'
import { listImports } from '@/core/imports'

export const metadata: Metadata = { title: 'Connections' }

export default function ConnectionsPage() {
  return (
    <>
      <p className="mb-6 max-w-[60ch] text-body text-ink-2">
        Apps and devices that feed {brand.name}, sorted by what they track, plus Telegram and AI models. You bring the keys: they’re encrypted in your local database, and nothing syncs until you connect it.
      </p>
      <Suspense fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-72 rounded-full" />
          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-10">
            <div className="hidden flex-col gap-1 lg:flex">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>
            <div className="flex flex-col gap-8">
              <Skeleton className="h-10 w-full max-w-sm" />
              <div className="@container"><div className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[150px] rounded-[18px]" />)}</div></div>
            </div>
          </div>
        </div>
      }>
        <Connections />
      </Suspense>
    </>
  )
}

async function Connections() {
  await connection()
  const user = await getUser() // also applies connected keys to process.env
  // The address the service sends you back to: the one this page was opened on (127.0.0.1:3030 by default).
  const { items, worker } = await loadConnectorItems(user, requestOrigin(await headers()))
  const imports = (await listImports(user)).map((i) => ({
    id: i.id, kind: i.kind, fileName: i.fileName, status: i.status as 'queued' | 'running' | 'done' | 'failed' | 'undone', summary: i.summary, error: i.error, at: (i.finishedAt ?? i.createdAt).toISOString(),
  }))
  return <ConnectorMarket items={items} worker={worker} areas={user.profile.areas} imports={imports} zipMaxMb={Math.max(1, Number(env('RELIFE_IMPORT_MAX_MB')) || 2048)} />
}
