import { areaHref, type AreaDef } from '@/core/areas'
import type { ActivityKind } from '@/domain/activity'
import type { Status } from '@/domain/status-of'
import { Skeleton } from '../card'
import { LevelBar } from '../capsule'
import { StatusRow } from '../status-row'
import { ShareBar } from './time-tile'

export type RowData = {
  def: AreaDef
  status: Status
  /** One plain line: the week's biggest change in this area, else its brief. */
  line: string
  /** The area's level and how far to the next; Time has none. */
  level?: { level: number; progress: number }
  /** Time only: the week's laptop time by kind, drawn as one share bar. */
  kinds?: { kind: ActivityKind; seconds: number }[]
}

/** The height of a loaded row, so the card does not move when the numbers arrive. */
export const RowSkeleton = () => <Skeleton className="h-[72px] rounded-md" />

/**
 * One area as a status row: its picture, name, one line, the level bar (Time: its share bar), the status word, and a chevron to
 * the area page. The level sits in a column from 448px of page; below that it moves under the line and the name carries "Lv 21".
 * The numbers, trends and week dots live on the area page and its Peek.
 */
export function AreaRow({ d }: { d: RowData }) {
  const { def, level, kinds } = d
  const bar = level
    ? <LevelBar value={level.progress} max={1} size="md" color={def.color} label={`${def.title} level ${level.level} progress`} />
    : kinds?.length ? <ShareBar kinds={kinds} /> : null
  return (
    <StatusRow
      picture={{ of: 'area', to: def.slug }} pictureSize={40} href={areaHref(def)} status={d.status} line={d.line}
      name={<>{def.title}{level ? <span className="ms-2 text-small font-normal text-ink-3 tabular-nums @md:hidden">Lv {level.level}</span> : null}</>}
      meta={bar ? <div><span className="block text-caption text-ink-3 tabular-nums">{level ? `Lv ${level.level}` : 'By kind of use'}</span><div className="mt-1">{bar}</div></div> : undefined}
      under={bar ?? undefined} underClass="@md:hidden"
    />
  )
}
