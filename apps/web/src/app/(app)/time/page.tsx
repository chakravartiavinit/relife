import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/db'
import { LibraryGrid } from '@/ui/components/library'
import { getUser } from '@/core/user'
import { loadTime } from '@/core/areas/time'
import { laptopEnabled } from '@/core/activity'
import { ago } from '@/ui/components/area/time-summary'
import { extensionLastSeen } from '@/core/auth/devices'
import { localDate } from '@/core/time'
import { Card, Skeleton } from '@/ui/components/card'
import { EmptyState } from '@/ui/components/empty'
import { buttonClass, buttonLinkClass } from '@/ui/components/button'
import { TimeBoard } from './time-board'
import { timeConnection } from './time-link'

export const metadata: Metadata = { title: 'Time' }

export default function TimePage() {
  return (
    <Suspense fallback={<TimeSkeleton />}>
      <Time />
    </Suspense>
  )
}

/** The page's shape while it loads: the lead card (with the library and By kind beside it), then the sites. */
function TimeSkeleton() {
  return (
    <div className="@container" aria-busy>
      <div className="grid grid-cols-1 gap-6 grid-lg:grid-cols-12">
        <Skeleton className="h-[780px] rounded-lg grid-lg:col-span-8 grid-lg:h-[650px]" />
        <Skeleton className="h-[480px] rounded-lg grid-lg:col-span-4 grid-lg:h-[400px]" />
        <Skeleton className="h-[460px] rounded-lg grid-lg:col-span-12" />
      </div>
    </div>
  )
}

/** Library rows shown before the rest fold away. */
const TOP_LIBRARY = 3

async function Time() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const [t, library, seen, link] = await Promise.all([
    loadTime(user, today),
    db.select().from(schema.learningItems).where(and(eq(schema.learningItems.userId, user.id), ne(schema.learningItems.status, 'done')))
      .orderBy(desc(schema.learningItems.lastActiveAt)),
    extensionLastSeen(user.id),
    timeConnection(user),
  ])
  if (!t.s.rows) return <Setup connected={await laptopEnabled(user.id)} seen={seen} />
  return (
    <TimeBoard
      t={t} today={today} link={link}
      library={<LibraryGrid compact limit={TOP_LIBRARY} items={library} empty={<p className="py-2 text-small text-ink-3">Nothing tracked yet. Open a course or show, click the {brand.name} extension and press Track this.</p>} />}
    />
  )
}

function Setup({ connected, seen }: { connected: boolean; seen: Date | null }) {
  return (
    <Card>
      <EmptyState
        picture={{ of: 'device', name: 'laptop' }}
        title={connected ? 'Waiting for the first minutes' : 'Track your laptop time'}
        description={
          <>
            {connected && seen ? <span className="mb-2 block font-medium text-ink-2">The extension last reached {brand.name} {ago(seen)}. Time shows here after a few minutes on a site.</span> : null}
            1. On <Link href="/you/connections" className={buttonLinkClass()}>You › Connections → Laptop activity</Link>, set a token.{' '}
            2. In Chrome open <code className="rounded-xs bg-surface-2 px-1">chrome://extensions</code>, turn on Developer mode, choose Load unpacked and pick the <code className="rounded-xs bg-surface-2 px-1">apps/extension</code> folder in {brand.name}.{' '}
            3. Open the extension and paste the same token. Mac apps are recorded by {brand.name}’s worker on its own.
          </>
        }
        action={<Link href="/you/connections" className={buttonClass({ variant: 'primary', size: 'sm' })}>{connected ? 'Check the connection' : 'Set it up'}</Link>}
      />
    </Card>
  )
}
