import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChevronRight } from 'lucide-react'
import { getUser } from '@/core/user'
import { loadMetricPeek } from '@/core/peek/metric'
import { amountText } from '@/domain/capture'
import { CATEGORY } from '@/ui/tokens'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { ArchiveTrackerButton } from '@/ui/components/forms/tracker-forms'
import { MetricDetail } from '@/ui/components/peek/views/metric'

export const metadata: Metadata = { title: 'Tracker' }

export default function TrackerPage({ params }: PageProps<'/plan/trackers/[slug]'>) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TrackerDetail params={params} />
    </Suspense>
  )
}

/** The same payload as the metric Peek (`/api/peek`), loaded on the server and drawn wide, so the two cannot drift. */
async function TrackerDetail({ params }: { params: PageProps<'/plan/trackers/[slug]'>['params'] }) {
  await connection()
  const [{ slug: raw }, user] = await Promise.all([params, getUser()])
  const data = await loadMetricPeek(user, decodeURIComponent(raw))
  if (!data) notFound()
  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-small text-ink-3">
        <Link href="/plan/trackers" className="rounded-sm hover:text-ink">Trackers</Link>
        <ChevronRight className="size-3.5" strokeWidth={1.5} />
        <span className="text-ink-2">{data.name}</span>
      </nav>
      <PageHeader
        eyebrow={CATEGORY[data.category].label}
        title={data.name}
        description={data.target ? `Target ${amountText(data.target, data.unit)} a day, ${data.direction === 'down' ? 'lower is better' : 'higher is better'}.` : undefined}
        actions={<ArchiveTrackerButton id={data.id} name={data.name} />}
      />
      <MetricDetail data={data} wide />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-8 h-9 w-56" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[340px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    </div>
  )
}
