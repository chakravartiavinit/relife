import { routineArt } from '../routine-icons'
import { cn } from '../cn'

// A routine's 3D picture (public/routines). The picture is the subject, so it carries a soft drop shadow
// instead of a photo outline.

export function RoutineArt({ name, kind, area, className }: { name: string; kind: string; area: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small local PNGs
    <img src={routineArt(name, kind, area)} alt="" width={256} height={256} className={cn('size-6 object-contain outline-none drop-shadow-[0_2px_3px_oklch(0.3_0.04_250/0.18)]', className)} />
  )
}

const TILE = {
  md: { box: 'size-10 rounded-[10px]', img: 'size-7' },
  base: { box: 'size-12 rounded-lg', img: 'size-8' },
  lg: { box: 'size-14 rounded-lg', img: 'size-10' },
}

/**
 * The 3D icon tile (`.tile` in the mockups): a picture on a soft radial tint of `tint`, 40 / 48 / 56px.
 * Pass `src` for a picture or `children` for a glyph. Decorative: the text beside it names the thing.
 */
export function IconTile({ src, tint = 'var(--accent)', size = 'base', children, className }: {
  src?: string; tint?: string; size?: keyof typeof TILE; children?: React.ReactNode; className?: string
}) {
  const t = TILE[size]
  return (
    <span aria-hidden className={cn('tile-bg flex shrink-0 items-center justify-center text-ink-2', t.box, className)} style={{ '--tc': tint } as React.CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small local PNGs */}
      {src ? <img src={src} alt="" width={256} height={256} className={cn('block object-contain outline-none', t.img)} /> : children}
    </span>
  )
}
