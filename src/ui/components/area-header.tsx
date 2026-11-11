import { connection } from 'next/server'
import { Suspense } from 'react'
import type { Category } from '@/db/schema'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'
import { MEDALS } from '@/domain/xp'
import { formatNumber } from '@/domain/money'
import { AREA_ART } from '../area-art'
import { CATEGORY } from '../tokens'
import { Bar } from './kit/bar'
import { Hero } from './kit/hero'
import { Skeleton } from './kit/skeleton'
import { IconTile } from './routine-art'
import { MedalDisc } from './xp'

// Each area page opens with a Hero: the area's picture on a tile in its colour, and its own level.
// The title and copy render at once; the level streams in (it needs the database).

export function AreaHeader({ area, title, description, actions, tabs }: {
  area: Category; title: string; description?: string; actions?: React.ReactNode; tabs?: React.ReactNode
}) {
  const c = CATEGORY[area].color
  return (
    <Hero
      meta={CATEGORY[area].label}
      art={<IconTile src={AREA_ART[area]} tint={c} size="lg" className="max-sm:hidden" />}
      title={title}
      lede={description}
      actions={actions}
      side={<Suspense fallback={<Skeleton className="h-[88px] rounded-lg" />}><AreaLevel area={area} /></Suspense>}
      tabs={tabs}
    />
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
    <div className="stat-bg flex w-full items-center gap-3 rounded-lg px-4 py-3">
      <MedalDisc medal={a.medal?.medal ?? null} size={30} label={a.medal ? `${a.medal.label} medal` : 'No medal yet'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[20px] leading-6 font-semibold tracking-[-0.02em] text-ink tabular-nums">Lv {a.level}</span>
          <span className="font-mono text-[12px] text-ink-3">{formatNumber(a.xp)} XP</span>
        </div>
        <Bar value={a.progress} max={1} size={4} color={c} label={`${CATEGORY[area].label} level progress`} className="mt-2" />
        <div className="t-meta mt-1.5 tabular-nums">{formatNumber(toNext)} XP to Lv {a.level + 1}{next ? ` · ${next.label} at ${next.level}` : ''}</div>
      </div>
    </div>
  )
}
