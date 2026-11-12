import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { ChevronRight, MonitorSmartphone } from 'lucide-react'
import type { Category } from '@/db/schema'
import { getUser } from '@/core/user'
import { PageHeader, Skeleton } from '@/ui/components/card'
import { AREA_ICON, CapsuleIcon } from '@/ui/components/capsule-icon'
import { LifeKpis } from '@/ui/components/life-kpis'
import { CATEGORY } from '@/ui/tokens'

export const metadata: Metadata = { title: 'Life' }

const AREAS: { category: Category; href: string }[] = [
  { category: 'health', href: '/health' },
  { category: 'mind', href: '/mind' },
  { category: 'skills', href: '/skills' },
  { category: 'wealth', href: '/wealth' },
  { category: 'hobbies', href: '/hobbies' },
  { category: 'relationships', href: '/people' },
]

/** The Life hub: this week against last for every area, then one row per area and Time. Phase 6 adds briefs to the tiles. */
export default function LifePage() {
  return (
    <>
      <PageHeader eyebrow="Life" title="Life" description="All six areas and your laptop time, one click each." />
      <div className="flex flex-col gap-8">
        <Suspense fallback={<Skeleton className="h-[176px] rounded-lg" />}>
          <Kpis />
        </Suspense>
        <nav aria-label="Areas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map(({ category, href }) => {
            const c = CATEGORY[category]
            return <AreaLink key={href} href={href} label={c.label} blurb={c.blurb} color={c.color} icon={AREA_ICON[category]} />
          })}
          <AreaLink href="/time" label="Time" blurb="Where your time on the laptop goes" color="var(--line-blue)" icon={MonitorSmartphone} />
        </nav>
      </div>
    </>
  )
}

async function Kpis() {
  await connection()
  return <LifeKpis user={await getUser()} now={new Date()} />
}

function AreaLink({ href, label, blurb, color, icon }: { href: string; label: string; blurb: string; color: string; icon: typeof MonitorSmartphone }) {
  return (
    <Link
      href={href}
      className="group flex min-h-[88px] items-center gap-4 rounded-lg bg-surface p-4 shadow-1 transition-[box-shadow,transform] duration-150 ease-out-quint hover:shadow-2 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
    >
      <CapsuleIcon size="sm" color={color} icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-heading text-ink">{label}</span>
        <span className="block truncate text-small text-ink-3">{blurb}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
    </Link>
  )
}
