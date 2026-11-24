import { Activity } from 'lucide-react'
import { CATEGORIES } from '@/domain/categories'
import type { User } from '@/core/user'
import { trackerDays, trackerFacts } from '@/core/metrics'
import { addDays, localDate } from '@/core/time'
import { deltaText, formatTileValue, orderTiles, summarizeTracker, type TileSummary } from '@/domain/metric-tile'
import { statusOf } from '@/domain/status-of'
import { pictureSpec } from '@/ui/picture'
import { CATEGORY } from '@/ui/tokens'
import { Card } from '../card'
import { EmptyState } from '../empty'
import { Fold } from '../fold'
import { Picture } from '../picture'
import { StatusRow } from '../status-row'

/** The latest number with its change on usual (or the 7-day average), and where it comes from as the connector's own logo. */
function trackerLine(t: TileSummary) {
  const v = t.latest == null ? null : formatTileValue(t.latest, t.unit)
  const avg = t.avg7 == null ? null : formatTileValue(t.avg7, t.unit)
  const value = v ? `${v.text}${v.unit ? ` ${v.unit}` : ''}` : 'No value yet'
  const context = t.stale ? `synced ${t.daysSince} days ago` : t.note ? t.note : t.delta ? deltaText(t.delta) : avg ? `avg ${avg.text}${avg.unit ? ` ${avg.unit}` : ''}` : ''
  const source = t.sources.find((x) => x !== 'manual')
  const id = source?.split(/[-.:]/)[0]
  const logo = id && pictureSpec({ of: 'connector', id }).type !== 'letter' ? id : null
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-bottom">
      <span className="truncate tabular-nums">{value}{context ? ` · ${context}` : ''}</span>
      {logo ? <><span aria-hidden>·</span><Picture of="connector" id={logo} size={20} label={`from ${logo}`} /></> : source === undefined ? <span className="shrink-0">· you</span> : null}
    </span>
  )
}

/**
 * Every tracker by area, one `StatusRow` each: its picture, the latest number with the change on usual, where it comes
 * from (the connector's logo, or "you" for a hand-entered one) and a status word. A tap opens the metric's Peek where the
 * value is logged. Active ones first; quiet trackers and ones with no data yet fold into a Fold so a new tracker is still
 * findable. Server component.
 */
export async function TrackersGrid({ user }: { user: User }) {
  const today = localDate(new Date(), user.timezone)
  const all = await trackerDays(user, addDays(today, -89), today)
  if (!all.length) {
    return (
      <Card>
        <EmptyState title="No trackers yet" picture={{ of: 'tracker', name: 'Steps' }} description="Create one, or type “water 250” in ⌘K and it appears here." />
      </Card>
    )
  }
  const facts = await trackerFacts(user, addDays(today, -89), today, all.filter((d) => d.days.size).map((d) => d.tracker.id))
  const tiles = all.map((d) => ({ category: d.tracker.category, tile: summarizeTracker(d.tracker, d.days, today, facts.get(d.tracker.id)) }))
  return (
    <div className="flex flex-col gap-6">
      {CATEGORIES.map((c) => {
        const mine = tiles.filter((t) => t.category === c).map((t) => t.tile)
        if (!mine.length) return null
        const { shown, quiet } = orderTiles(mine, [])
        const folded = [...quiet, ...mine.filter((t) => t.state === 'none')]
        const row = (t: TileSummary) => (
          <StatusRow key={t.slug} picture={{ of: 'tracker', name: t.name, kind: t.kind, area: c }} name={t.name} line={trackerLine(t)}
            status={statusOf({ from: 'tracker', tile: t }).word} peek={{ type: 'metric', id: t.slug }} />
        )
        return (
          <Card key={c} as="section" aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`} className="mb-2 flex items-center gap-2.5 font-display text-heading text-ink">
              <Picture of="area" to={c} size={32} />
              {CATEGORY[c].label}
              <span className="font-sans text-small font-normal text-ink-3 tabular-nums">{mine.length}</span>
            </h2>
            {shown.length ? <div>{shown.map(row)}</div> : null}
            {folded.length ? (
              <Fold title="Quiet" summary={`${folded.length} with nothing in 14 days`} defaultOpen={!shown.length} className="mt-1">
                <div>{folded.map(row)}</div>
              </Fold>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}
