import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { addDays, daysBetween, localDate } from '@/core/time'
import { Badge, Card, CardHeader, KpiStrip, PageHeader } from '@/ui/components/card'
import { trackerDays } from '@/core/metrics'
import { EmptyState } from '@/ui/components/empty'
import { RoutinesCard } from '@/ui/components/category/routines-card'
import { CategorySkeleton } from '@/ui/components/category/skeleton'
import { ContactedButton, NewPersonButton } from '@/ui/components/forms/people-forms'

export const metadata: Metadata = { title: 'People' }

export default function RelationshipsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Your people"
        description="The people who matter, and how long it’s been."
        actions={<NewPersonButton />}
      />
      <Suspense fallback={<CategorySkeleton cards={2} />}>
        <People />
      </Suspense>
    </div>
  )
}

function ago(days: number) {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

async function People() {
  await connection()
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const people = await db.select().from(schema.people).where(eq(schema.people.userId, user.id)).orderBy(asc(schema.people.name))
  const rows = people.map((p) => {
    const since = p.lastContactedAt ? daysBetween(localDate(p.lastContactedAt, user.timezone), today) : null
    const overdue = p.contactEveryDays != null && (since == null || since > p.contactEveryDays)
    return { p, since, overdue }
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.since ?? 1e9) - (a.since ?? 1e9))
  const [contacts] = await trackerDays(user, addDays(today, -29), today, { slugs: ['people.contacts'] })
  const catchUps = [...(contacts?.days.values() ?? [])].reduce((s, v) => s + v, 0)
  const tracked = rows.filter((r) => r.p.contactEveryDays != null)
  const overdue = tracked.filter((r) => r.overdue)
  const longest = rows.reduce<{ name: string; since: number } | null>((m, r) => (r.since != null && (!m || r.since > m.since) ? { name: r.p.name, since: r.since } : m), null)

  return (
    <div className="flex flex-col gap-6">
    <KpiStrip items={[
      { label: 'In touch', value: tracked.length ? `${tracked.length - overdue.length}/${tracked.length}` : '–', sub: tracked.length ? 'within their rhythm' : 'Add people with a rhythm' },
      { label: 'Overdue', value: String(overdue.length), sub: overdue[0] ? `Start with ${overdue[0].p.name}` : 'Nobody waiting', tone: overdue.length ? 'bad' : undefined },
      { label: 'Catch-ups, 30 days', value: String(catchUps) },
      { label: 'Longest gap', value: longest ? `${longest.since}d` : '–', sub: longest?.name },
    ]} />
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Keep in touch" description={rows.length ? `${rows.filter((r) => r.overdue).length} overdue` : undefined} />
        {rows.length ? (
          <ul className="-my-2 divide-y divide-divider">
            {rows.map(({ p, since, overdue }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] text-ink">{p.name}</span>
                    {overdue ? <Badge color="var(--warn)">Overdue</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-3">
                    {[p.relation, since == null ? 'Not logged yet' : ago(since), p.contactEveryDays ? `every ${p.contactEveryDays} days` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <ContactedButton id={p.id} name={p.name} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Add the people you want to stay close to" description="Add family and old friends, set how often you want to talk (say every 7 days), and see who you’ve drifted from." />
        )}
      </Card>
      <RoutinesCard user={user} category="relationships" />
    </div>
    </div>
  )
}
