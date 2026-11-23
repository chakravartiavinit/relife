import type { AreaDef, AreaSlug } from '@/core/areas'
import { trackerDays } from '@/core/metrics'
import { addDays } from '@/core/time'
import type { User } from '@/core/user'
import { summarizeTracker } from '@/domain/metric-tile'
import { fillDays } from '@/domain/series'
import { leadSummary, trackerStatus } from '@/domain/tracker-row'
import { Card, CardHeader } from '../card'
import { LeadChart } from '../charts'
import { Connection } from '../connection'
import { EmptyState } from '../empty'
import { PeekLink } from '../peek/peek-link'
import { buttonLinkClass } from '../button'
import { StatusWord } from '../status-word'
import { areaPatterns, explaining } from './area-patterns'

/** The tracker an area's Overview leads with: the first of these that has data. Hobbies and People lead with their own cards. */
export const LEAD_TRACKERS: Partial<Record<AreaSlug, string[]>> = {
  health: ['sleep.hours'], mind: ['mood'], skills: ['coding.minutes', 'github.commits', 'learning.minutes'],
}

const EMPTY: Partial<Record<AreaSlug, { title: string; description: React.ReactNode }>> = {
  health: { title: 'No sleep data yet', description: <>Send <code>/sleep</code> and <code>/wake</code> to the Telegram bot, or set up the Sleep Focus shortcut.</> },
  mind: { title: 'No mood logged yet', description: 'Use the check-in once a day. Patterns show up after a week.' },
  skills: { title: 'Nothing tracked yet', description: 'Connect GitHub or WakaTime, or log practice from Capture, and the last 28 days draw here.' },
}

/**
 * One chart leads the Overview: the area's lead tracker over 28 days against its target (or its own usual), the status as a
 * word in the heading, and under it the connection that explains it when `findChanges` / `findLinks` has one. Nothing
 * else on the card.
 */
export async function AreaLead({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const slugs = LEAD_TRACKERS[def.slug] ?? []
  const from = addDays(today, -27)
  const all = await trackerDays(user, addDays(today, -89), today, { slugs })
  const lead = slugs.map((s) => all.find((d) => d.tracker.slug === s)).find((d) => d?.days.size)
  if (!lead) return <Card><EmptyState picture={{ of: 'area', to: def.slug }} title={EMPTY[def.slug]!.title} description={EMPTY[def.slug]!.description} /></Card>
  const { tracker: t } = lead
  const points = fillDays(lead.days, from, today)
  const tile = summarizeTracker(t, lead.days, today)
  const { reference, line } = leadSummary(t, points)
  const link = explaining(await areaPatterns(user, def), `tracker:${t.slug}`)
  const nights = t.slug.startsWith('sleep')
  return (
    <Card aria-labelledby="lead-heading" className="flex flex-col gap-4">
      <CardHeader
        className="mb-0"
        title={<span id="lead-heading">{t.name}, last 28 {nights ? 'nights' : 'days'}</span>} description={line}
        action={<span className="flex items-center gap-3"><StatusWord status={trackerStatus(t, tile)} /><PeekLink to={{ type: 'metric', id: t.slug }} className={buttonLinkClass('hidden text-small @lg:inline')}>See the days</PeekLink></span>}
      />
      <LeadChart data={points} color={def.color} unit={t.unit ?? undefined} reference={reference ?? undefined} direction={t.direction} label={`${t.name}, last 28 days`} height={240} />
      {link ? <div className="rounded-md bg-surface-2 p-4"><Connection {...link} /></div> : null}
    </Card>
  )
}
