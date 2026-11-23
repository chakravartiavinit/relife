import { connection } from 'next/server'
import { Suspense } from 'react'
import { MonitorSmartphone } from 'lucide-react'
import { areaScope, type AreaDef } from '@/core/areas'
import { latestBrief } from '@/core/briefs'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'
import { MEDALS } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { AREA_ICON, CapsuleIcon } from '../capsule-icon'
import { LevelBar } from '../capsule'
import { SystemLabel } from '../card'
import { PageHead } from '../page-head'
import { PeekLink } from '../peek/peek-link'
import { MedalDisc } from '../xp'

// Every area page opens the same way (the compact `PageHead`): the area's capsule, its name as the title, one line of
// what is going on (the brief, with a Why? that shows the numbers behind it) and, on the right, the level and its XP.
// The tab row and the Log button sit under it. The title and the static description render at once; the brief and the
// level stream in (they need the database).

export function AreaHeader({ def, right, tabs, actions, summary }: { def: AreaDef; right?: React.ReactNode; tabs?: React.ReactNode; actions?: React.ReactNode; /** Replaces the level bar (Time, which has no level, shows today's numbers). */ summary?: React.ReactNode }) {
  const Icon = def.category ? AREA_ICON[def.category] : MonitorSmartphone
  return (
    <PageHead
      tone={def.color}
      capsule={<CapsuleIcon color={def.color} icon={Icon} size="sm" className="ms-1" />}
      label={<SystemLabel color={def.color}>{def.title}</SystemLabel>}
      title={def.title}
      // The static description holds the space until the brief arrives, so the header never jumps.
      brief={<Suspense fallback={def.description}><AreaBrief def={def} /></Suspense>}
      summary={summary ?? (def.category ? <Suspense fallback={<div className="h-[52px] w-full rounded-md bg-surface-2" />}><AreaLevel def={def} /></Suspense> : undefined)}
      tabs={tabs}
      actions={right || actions ? <>{right}{actions}</> : undefined}
    />
  )
}

/** The brief's line with a Why? link, or the static description when none is written yet (no data, or `db:push` not run). */
async function AreaBrief({ def }: { def: AreaDef }) {
  await connection()
  const scope = areaScope(def)
  const brief = await latestBrief(await getUser(), scope)
  if (!brief) return def.description
  return (
    <>
      {brief.text}{' '}
      <PeekLink to={{ type: 'brief', id: scope }} className="rounded-xs font-medium whitespace-nowrap text-pill-ink hover-fine:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink>
    </>
  )
}

/** Level, XP and how far to the next one, in the head's right column: the reward layer, not the point of the page. */
async function AreaLevel({ def }: { def: AreaDef }) {
  await connection()
  const s = await xpSummary(await getUser())
  const a = s.areas.find((x) => x.area === def.category)!
  const next = MEDALS.find((m) => m.level > a.level)
  const toNext = Math.max(0, Math.ceil((a.next - a.xp * 3) / 3))
  return (
    <div className="w-full" aria-label={`${def.title} level ${a.level}, ${formatNumber(toNext)} XP to level ${a.level + 1}`}>
      <div className="flex items-center gap-3">
        <MedalDisc medal={a.medal?.medal ?? null} size={24} label={a.medal ? `${a.medal.label} medal` : 'No medal yet'} />
        <span className="num text-heading text-ink">Lv {a.level}</span>
        <LevelBar value={a.progress} max={1} size="md" segments={20} color={def.color} label={`${def.title} level progress`} className="flex-1" />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-caption text-ink-3 tabular-nums">
        <span className="truncate">{formatNumber(toNext)} XP to Lv {a.level + 1}{next ? <span className="hidden grid-lg:inline"> · {next.label} at {next.level}</span> : null}</span>
        <span className="shrink-0">{formatNumber(a.xp)} XP</span>
      </div>
    </div>
  )
}
