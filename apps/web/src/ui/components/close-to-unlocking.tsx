import { AllLockedLink } from './all-locked-link'
import { Card, CardHeader } from './card'
import { LevelBar } from './capsule'
import { TIER_COLOR } from '../achievement-icons'
import { almostThere, fmt, lockedFirst, Medallion, type BoardItem } from './achievement-parts'

/** The lead's second block: the (up to three) locked achievements that are closest, each with how far it is and what it pays. */
export function CloseToUnlocking({ items }: { items: BoardItem[] }) {
  const close = almostThere(items)
  const locked = lockedFirst(items).length
  return (
    <Card as="section" aria-labelledby="close-to-unlocking" className="flex h-full flex-col">
      <CardHeader
        title={<span id="close-to-unlocking">Close to unlocking</span>}
        description={`${close.length} of ${locked} locked achievements`}
        action={<AllLockedLink />}
      />
      {close.length ? (
        <ul className="flex flex-1 flex-col divide-y divide-divider">
          {close.map((a) => {
            const pct = a.progress.value / a.progress.target
            return (
              <li key={a.key} className="flex flex-1 items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                <Medallion a={a} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-body font-medium text-ink">{a.name}</span>
                    <span className="num shrink-0 text-body text-ink">{Math.round(pct * 100)}%</span>
                  </div>
                  <p className="truncate text-small text-ink-3">{a.description}</p>
                  <LevelBar value={pct} color={TIER_COLOR[a.tier]} size="sm" segments={10} label={`${a.name}: ${fmt(a.progress.value)} of ${fmt(a.progress.target)}`} className="mt-2" />
                  <p className="mt-1.5 flex justify-between gap-2 text-caption text-ink-3 tabular-nums"><span>{fmt(a.progress.target - a.progress.value)} to go</span>{a.xp ? <span>+{fmt(a.xp)} XP</span> : null}</p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : <p className="text-small text-ink-3">Nothing is partway yet. Keep checking things off and the next badge shows up here.</p>}
    </Card>
  )
}
