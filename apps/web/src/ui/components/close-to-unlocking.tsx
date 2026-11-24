import { AllLockedLink } from './all-locked-link'
import { Card, CardHeader } from './card'
import { Capsule } from './capsule'
import { Picture } from './picture'
import { TIER_COLOR } from '../achievement-icons'
import { almostThere, fmt, lockedFirst, type BoardItem } from './achievement-parts'

/** The next level as the first unlock: what is left, the pace it lands at and the title it brings. */
export type NextLevel = { level: number; toGo: number; progress: number; title: string | null; when: string | null; pace: string | null }

/**
 * Next unlocks: the next level first (with the title it brings), then the closest locked achievements, three rows in
 * all. Each row has its medal, one line, a bar and where it stands. The first row is the level only when `level` is given.
 */
export function CloseToUnlocking({ items, level }: { items: BoardItem[]; level?: NextLevel }) {
  // The level's own achievement (Reach level 25) is the same unlock as the first row: it pays into it instead.
  const levelAch = level ? items.find((a) => a.key === `level-${level.level}`) : undefined
  const close = almostThere(items, level ? 2 : 3, levelAch?.key)
  const locked = lockedFirst(items).length
  const count = close.length + (level ? 1 : 0)
  return (
    <Card as="section" aria-labelledby="close-to-unlocking" className="flex h-full flex-col">
      <CardHeader
        title={<span id="close-to-unlocking">{count === 1 ? 'Next unlock' : `Next ${count} unlocks`}</span>}
        description={locked ? undefined : 'Every achievement is unlocked.'}
        action={locked ? <AllLockedLink /> : undefined}
      />
      {count ? (
        <ul className="flex flex-1 flex-col divide-y divide-divider">
          {level ? (
            <Unlock
              key="level"
              picture={<Picture of="achievement" id={levelAch?.key ?? `level-${level.level}`} tier={levelAch?.tier ?? 'gold'} size={40} />}
              name={level.title ? `Level ${level.level} and ${level.title}` : `Level ${level.level}`}
              line={level.pace ? `${fmt(level.toGo)} XP to go, ${level.pace} at your usual pace` : `${fmt(level.toGo)} XP to go`}
              value={level.progress} color="var(--pill)" label={`Level ${level.level}: ${fmt(level.toGo)} XP to go`}
              left={level.when ?? `${fmt(level.toGo)} XP to go`}
              right={[level.title ? `${level.title} title` : null, levelAch?.xp ? `+${fmt(levelAch.xp)} XP` : null].filter(Boolean).join(' · ')}
            />
          ) : null}
          {close.map((a) => (
            <Unlock
              key={a.key}
              picture={<Picture of="achievement" id={a.key} tier={a.tier} size={40} />}
              name={a.name} line={a.description}
              value={a.progress.value / a.progress.target} color={TIER_COLOR[a.tier]} label={`${a.name}: ${fmt(a.progress.value)} of ${fmt(a.progress.target)}`}
              left={`${fmt(a.progress.target - a.progress.value)} to go`} right={a.xp ? `+${fmt(a.xp)} XP` : ''}
            />
          ))}
        </ul>
      ) : <p className="text-small text-ink-3">Nothing is partway yet. Keep checking things off and the next badge shows up here.</p>}
    </Card>
  )
}

function Unlock({ picture, name, line, value, color, label, left, right }: {
  picture: React.ReactNode; name: string; line: string; value: number; color: string; label: string; left: string; right: string
}) {
  return (
    <li className="flex flex-1 items-center gap-3.5 py-3 first:pt-0 last:pb-0">
      {picture}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{name}</p>
        <p className="line-clamp-2 text-small text-ink-3">{line}</p>
        <Capsule value={value} color={color} size="sm" label={label} className="mt-2" />
        <p className="mt-1.5 flex justify-between gap-2 text-small text-ink-2 tabular-nums"><span>{left}</span>{right ? <span className="text-ink-3">{right}</span> : null}</p>
      </div>
    </li>
  )
}
