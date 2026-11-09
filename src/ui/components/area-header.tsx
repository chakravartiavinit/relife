import { connection } from 'next/server'
import { Suspense } from 'react'
import type { Category } from '@/db/schema'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'
import { MEDALS } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { CATEGORY } from '../tokens'
import { Capsule } from './capsule'
import { MedalDisc } from './xp'
import { AREA_ICON, CapsuleIcon } from './capsule-icon'
import { SystemLabel } from './card'

// Each area page opens like a stat screen in the game: the area's colour, its icon, and its own level.
// The title and copy render at once; the level streams in (it needs the database).

export function AreaHeader({ area, title, description, actions }: {
  area: Category; title: string; description?: string; actions?: React.ReactNode
}) {
  const c = CATEGORY[area].color
  const Icon = AREA_ICON[area]
  return (
    <header className="relative isolate mb-6 overflow-hidden rounded-[24px] bg-surface p-5 shadow-2 sm:p-6">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-2/3" style={{ '--tone': c } as React.CSSProperties} />
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <CapsuleIcon color={c} icon={Icon} size="lg" className="ms-2 sm:ms-1" />
        <div className="min-w-0">
          <SystemLabel color={c}>{CATEGORY[area].label}</SystemLabel>
          <h1 className="mt-0.5 font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-[34px]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
          <Suspense fallback={<div className="h-[68px] w-[220px] rounded-[16px] bg-surface/60" />}><AreaLevel area={area} /></Suspense>
          {actions}
        </div>
      </div>
    </header>
  )
}

async function AreaLevel({ area }: { area: Category }) {
  await connection()
  const user = await getUser()
  const s = await xpSummary(user)
  const a = s.areas.find((x) => x.area === area)!
  const next = MEDALS.find((m) => m.level > a.level)
  const toNext = Math.max(0, Math.ceil((a.next - a.xp * 3) / 3))
  const c = CATEGORY[area].color
  return (
    <div className="flex w-full items-center gap-3 rounded-[16px] bg-surface/75 px-4 py-3 shadow-1 backdrop-blur-sm sm:w-[240px]">
      <MedalDisc medal={a.medal?.medal ?? null} size={30} label={a.medal ? `${a.medal.label} medal` : 'No medal yet'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[20px] leading-none font-extrabold text-ink tabular-nums">Lv {a.level}</span>
          <span className="text-[11.5px] text-ink-3 tabular-nums">{formatNumber(a.xp)} XP</span>
        </div>
        <Capsule value={a.progress} max={1} size="sm" color={c} label={`${CATEGORY[area].label} level progress`} className="mt-2" />
        <div className="mt-1 text-[11px] text-ink-3 tabular-nums">{formatNumber(toNext)} XP to Lv {a.level + 1}{next ? ` · ${next.label} at ${next.level}` : ''}</div>
      </div>
    </div>
  )
}
