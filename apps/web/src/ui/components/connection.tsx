import type { Change, Link } from '@/domain/patterns'
import { connectionView, type ConnectionView } from '@/domain/connection-view'
import { cn } from '../cn'
import type { PictureRef } from '../picture'
import { buttonLinkClass } from './button'
import { PeekLink } from './peek/peek-link'
import { Picture } from './picture'
import { StatusWord } from './status-word'

// Two things in a life that move together, in one sentence. The sentence is `describeLink` / `describeChange` with its key
// figures in bold, so a screen shows a connection only when `findLinks` / `findChanges` returned one.

const AREA_COLOR: Record<string, string> = {
  health: 'var(--cat-health)', mind: 'var(--cat-mind)', skills: 'var(--cat-skills)', wealth: 'var(--cat-wealth)',
  hobbies: 'var(--cat-hobbies)', relationships: 'var(--cat-relationships)', time: 'var(--line-blue)',
}
const color = (area: string) => AREA_COLOR[area] ?? 'var(--ink-3)'

/** The two area-coloured dots joined by a dashed line. One dot when the change has no partner. */
function Marks({ areas }: { areas: string[] }) {
  if (areas.length < 2) return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color(areas[0]) }} />
  return (
    <svg aria-hidden width="30" height="12" viewBox="0 0 30 12" className="shrink-0">
      <circle cx="5" cy="6" r="4" fill={color(areas[0])} />
      <path d="M10 6h10" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3" />
      <circle cx="25" cy="6" r="4" fill={color(areas[1])} />
    </svg>
  )
}

/** Each signal's own picture (20px) side by side, in place of the area dots. */
function Pictures({ of }: { of: PictureRef[] }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-1">
      {of.map((p, i) => <Picture key={i} {...p} size={20} />)}
    </span>
  )
}

const W = 300, H = 44, PAD = 3, LABEL = 76
/** The two lines, each scaled to its own range (they have different units); this week shaded for a change. */
function Spark({ lines, names }: { lines: NonNullable<ConnectionView['lines']>; names: string[] }) {
  const plotW = W - LABEL
  const path = (v: (number | null)[]) => {
    const real = v.filter((x): x is number => x != null)
    if (real.length < 2) return null
    const lo = Math.min(...real), hi = Math.max(...real), span = hi - lo || 1
    let d = '', pen = false, last: [number, number] | null = null
    v.forEach((x, i) => {
      if (x == null) { pen = false; return }
      const px = (i / (v.length - 1)) * plotW, py = H - PAD - ((x - lo) / span) * (H - 2 * PAD)
      d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`
      pen = true; last = [px, py]
    })
    return { d, last }
  }
  const a = path(lines.a), b = lines.b ? path(lines.b) : null
  // Direct labels sit at the end of their line; two that would touch are pushed 14px apart (the lower one down).
  const ya = (a?.last?.[1] ?? 0) + 4, yb = (b?.last?.[1] ?? 0) + 4
  const close = !!a && !!b && Math.abs(ya - yb) < 14
  const labelY = (isB: boolean) => (close && (isB ? yb >= ya : ya > yb) ? Math.min(ya, yb) + 14 : isB ? yb : ya)
  const n = lines.a.length
  return (
    <svg role="img" aria-label={`${names.join(' and ')} over the last ${n} days`} viewBox={`0 0 ${W} ${H}`} className="block h-11 w-full max-w-[300px] overflow-visible">
      {lines.weekFrom != null ? <rect x={(lines.weekFrom / (n - 1)) * plotW} y={0} width={plotW - (lines.weekFrom / (n - 1)) * plotW} height={H} rx={4} fill="var(--surface-2)" /> : null}
      {[{ p: a, name: names[0], stroke: 'var(--ink-3)' }, { p: b, name: names[1], stroke: 'var(--ink)' }].map((l, i) => l.p ? (
        <g key={i}>
          <path d={l.p.d} fill="none" stroke={l.stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {/* Direct label at the end of the line; two lines that end at the same height are nudged apart. */}
          <text x={plotW + 8} y={labelY(i === 1)} fontSize={12} fill="var(--ink-3)">{l.name}</text>
        </g>
      ) : null)}
    </svg>
  )
}

/**
 * A connection card body: the pair and when it holds, one sentence with the figures in bold, an optional two-line
 * sparkline (`spark`, needs `today`), and a footer with how much data it stands on and "See the days" (a Peek). Put it in
 * a `Card`, or on the page where it explains the number beside it.
 *
 * Pass `link` (from `findLinks`) or `change` (from `findChanges`), never both.
 */
export function Connection({ link, change, today, spark = false, pictures, trailing, className }: {
  link?: Link
  change?: Change
  /** The local date; required for the sparkline. */
  today?: string
  spark?: boolean
  /** The two signals' pictures (one for a change with no partner); they replace the area dots. */
  pictures?: PictureRef[]
  /** Another action beside "See the days" (Coach's "Ask why"). */
  trailing?: React.ReactNode
  className?: string
}) {
  const v = connectionView(link ? { link } : { change: change! }, { today })
  return (
    <article className={cn('flex flex-col gap-2.5', className)} aria-label={`Connection: ${v.pair}, ${v.when}`}>
      <div className="flex items-center gap-2 text-label text-ink-2">
        {pictures?.length ? <Pictures of={pictures} /> : <Marks areas={v.areas} />}
        <span className="truncate">{v.pair}</span>
        <span className="shrink-0 font-normal text-ink-3">· {v.when}</span>
        {v.status ? <StatusWord status={v.status} className="ml-auto" /> : null}
      </div>
      <p className="text-body text-ink">
        {v.parts.map((p, i) => (p.bold ? <b key={i} className="font-semibold">{p.text}</b> : <span key={i}>{p.text}</span>))}
      </p>
      {spark && v.lines ? <Spark lines={v.lines} names={v.names} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-caption text-ink-3">{v.caption}</span>
        {v.peek || trailing ? (
          <span className="flex items-center gap-4">
            {v.peek ? <PeekLink to={v.peek} className={buttonLinkClass('text-small', { target: true })}>See the days</PeekLink> : null}
            {trailing}
          </span>
        ) : null}
      </div>
    </article>
  )
}
