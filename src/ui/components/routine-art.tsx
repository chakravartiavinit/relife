import { routineArt } from '../routine-icons'
import { cn } from '../cn'

// A routine's 3D picture (public/routines) on its tinted tile. The picture is the subject, so it carries
// a soft drop shadow instead of a photo outline.

export function RoutineArt({ name, kind, area, className }: { name: string; kind: string; area: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small local PNGs
    <img src={routineArt(name, kind, area)} alt="" width={256} height={256} className={cn('size-6 object-contain outline-none drop-shadow-[0_2px_3px_oklch(0.3_0.04_250/0.18)]', className)} />
  )
}
