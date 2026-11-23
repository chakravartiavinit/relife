import { Users } from 'lucide-react'
import { loadPeople } from '@/core/areas/people'
import type { User } from '@/core/user'
import { PeekLink } from '../components/peek/peek-link'
import { Card, CardHeader } from '../components/card'
import { Picture } from '../components/picture'
import { StatusWord } from '../components/status-word'
import { EmptyState } from '../components/empty'
import { ContactedButton, NewPersonButton } from '../components/forms/people-forms'

function ago(days: number) {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 11) return '1 week ago'
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

/** Keep in touch: overdue first, a one-tap Contacted on every row, the row itself opens the person. */
export async function PeopleOverview({ user, today }: { user: User; today: string }) {
  const { rows } = await loadPeople(user, today)
  return (
    <>
      <Card>
        <CardHeader title="Keep in touch" description={rows.length ? `${rows.filter((r) => r.overdue).length} overdue` : 'Who you talk to, and how often'} />
        {rows.length ? (
          <ul className="-my-1">
            {rows.map(({ p, since, overdue }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)]">
                <PeekLink to={{ type: 'person', id: p.id }} aria-label={`${p.name}: open details`} className="-mx-2 flex min-h-14 min-w-0 flex-1 basis-56 items-center gap-3 rounded-md px-2 transition-colors duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-pill">
                  <Picture of="merchant" name={p.name} size={40} className="rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-ink">{p.name}</span>
                    <span className="block truncate text-small text-ink-3">
                      {[p.relation, since == null ? 'Not logged yet' : ago(since), p.contactEveryDays ? `every ${p.contactEveryDays} days` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {overdue ? <StatusWord status="Behind" /> : p.contactEveryDays ? <StatusWord status="On track" /> : null}
                </PeekLink>
                <ContactedButton id={p.id} name={p.name} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Add the people you want to stay close to" icon={Users} color="var(--cat-relationships)" description="Add family and old friends, set how often you want to talk (say every 7 days), and see who you’ve drifted from." action={<NewPersonButton />} />
        )}
      </Card>
    </>
  )
}
