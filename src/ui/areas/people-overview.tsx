import { Users } from 'lucide-react'
import { AREAS } from '@/core/areas'
import { loadPeople } from '@/core/areas/people'
import type { User } from '@/core/user'
import { AllMetrics } from '../components/area/all-metrics'
import { PeekLink } from '../components/peek/peek-link'
import { Badge, Card, CardHeader } from '../components/card'
import { EmptyState } from '../components/empty'
import { ContactedButton, NewPersonButton } from '../components/forms/people-forms'

const def = AREAS.people

function ago(days: number) {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

/** Keep in touch: overdue first, a one-tap Contacted on every row, the row itself opens the person. */
export async function PeopleOverview({ user, today }: { user: User; today: string }) {
  const { rows } = await loadPeople(user, today)
  return (
    <>
      <Card>
        <CardHeader title="Keep in touch" icon={<Users strokeWidth={2} />} color="var(--cat-relationships)" description={rows.length ? `${rows.filter((r) => r.overdue).length} overdue` : 'Who you talk to, and how often'} />
        {rows.length ? (
          <ul className="-my-2 divide-y divide-divider">
            {rows.map(({ p, since, overdue }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <PeekLink to={{ type: 'person', id: p.id }} aria-label={`${p.name}: open details`} className="flex min-w-0 flex-1 basis-48 items-center gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full text-body font-bold"
                    style={{ color: 'color-mix(in oklch, var(--cat-relationships) 80%, var(--ink))', background: overdue ? 'color-mix(in oklch, var(--warn) 18%, transparent)' : 'color-mix(in oklch, var(--cat-relationships) 16%, transparent)' }}
                  >
                    {p.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body text-ink">{p.name}</span>
                      {overdue ? <Badge color="var(--warn)">Overdue</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-small text-ink-3">
                      {[p.relation, since == null ? 'Not logged yet' : ago(since), p.contactEveryDays ? `every ${p.contactEveryDays} days` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </PeekLink>
                <ContactedButton id={p.id} name={p.name} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Add the people you want to stay close to" icon={Users} color="var(--cat-relationships)" description="Add family and old friends, set how often you want to talk (say every 7 days), and see who you’ve drifted from." action={<NewPersonButton />} />
        )}
      </Card>
      <AllMetrics user={user} def={def} today={today} />
    </>
  )
}
