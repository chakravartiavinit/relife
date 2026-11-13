import { connection } from 'next/server'
import { Suspense } from 'react'
import { MonitorSmartphone, Sparkles } from 'lucide-react'
import { areaScope, type AreaDef } from '@/core/areas'
import { latestBrief } from '@/core/briefs'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'
import { MEDALS } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { AREA_ICON, CapsuleIcon } from '../capsule-icon'
import { Capsule } from '../capsule'
import { SystemLabel } from '../card'
import { PeekLink } from '../peek/peek-link'
import { MedalDisc } from '../xp'

// Every area page opens the same way: the area's colour and icon, its name as the title, one line of what is
// going on (the brief, with a Why? that shows the numbers behind it) and a small level chip. The title and the
// static description render at once; the brief and the level stream in (they need the database).

export function AreaHeader({ def, right }: { def: AreaDef; right?: React.ReactNode }) {
  const Icon = def.category ? AREA_ICON[def.category] : MonitorSmartphone
  return (
    <header className="relative isolate mb-6 overflow-hidden rounded-xl bg-surface p-5 shadow-2 sm:p-6">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-2/3" style={{ '--tone': def.color } as React.CSSProperties} />
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <CapsuleIcon color={def.color} icon={Icon} size="lg" className="ms-2 sm:ms-1" />
        <div className="min-w-0">
          <SystemLabel color={def.color}>{def.title}</SystemLabel>
          <h1 className="mt-0.5 font-display text-title text-ink sm:text-display">{def.title}</h1>
          {/* The static description holds the space until the brief arrives, so the header never jumps. */}
          <Suspense fallback={<Line>{def.description}</Line>}><AreaBrief def={def} /></Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
          {def.category ? <Suspense fallback={<div className="h-[60px] w-full rounded-md bg-surface/60 sm:w-[200px]" />}><AreaLevel def={def} /></Suspense> : null}
          {right}
        </div>
      </div>
    </header>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 max-w-[60ch] text-body text-ink-2">{children}</p>
}

/** The brief's line with a Why? link, or the static description when none is written yet (no data, or `db:push` not run). */
async function AreaBrief({ def }: { def: AreaDef }) {
  await connection()
  const scope = areaScope(def)
  const brief = await latestBrief(await getUser(), scope)
  if (!brief) return <Line>{def.description}</Line>
  return (
    <p className="mt-1.5 flex max-w-[60ch] items-start gap-2 text-body text-ink-2">
      <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-pill-ink" strokeWidth={1.5} />
      <span>
        {brief.text}{' '}
        <PeekLink to={{ type: 'brief', id: scope }} className="rounded-xs font-semibold whitespace-nowrap text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Why?</PeekLink>
      </span>
    </p>
  )
}

/** Level, XP and how far to the next one: a small chip, the reward layer, not the point of the page. */
async function AreaLevel({ def }: { def: AreaDef }) {
  await connection()
  const s = await xpSummary(await getUser())
  const a = s.areas.find((x) => x.area === def.category)!
  const next = MEDALS.find((m) => m.level > a.level)
  const toNext = Math.max(0, Math.ceil((a.next - a.xp * 3) / 3))
  return (
    <div className="flex w-full items-center gap-3 rounded-md bg-surface/75 px-3 py-2.5 shadow-1 backdrop-blur-sm sm:w-[200px]">
      <MedalDisc medal={a.medal?.medal ?? null} size={28} label={a.medal ? `${a.medal.label} medal` : 'No medal yet'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-heading text-ink">Lv {a.level}</span>
          <span className="text-caption text-ink-3 tabular-nums">{formatNumber(a.xp)} XP</span>
        </div>
        <Capsule value={a.progress} max={1} size="sm" color={def.color} label={`${def.title} level progress`} className="mt-1.5" />
        <div className="mt-1 truncate text-caption text-ink-3 tabular-nums">{formatNumber(toNext)} XP to Lv {a.level + 1}{next ? ` · ${next.label} at ${next.level}` : ''}</div>
      </div>
    </div>
  )
}
