import { hobbyArt } from '../hobby-art'
import { cn } from '../cn'

// Hobby pictures: a 3D emoji (public/hobbies) on a soft tile in the Hobbies colour. The image is the
// picture itself, so it skips the photo outline. In dark mode the tile stays light so dark art (the chess pawn) still reads.

const SIZE = { sm: 'size-6 rounded-[7px] p-0.5', md: 'size-14 rounded-[16px] p-2', lg: 'size-20 rounded-[22px] p-3' }

export function HobbyImage({ name, size = 'md', className }: { name: string; size?: keyof typeof SIZE; className?: string }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center bg-[color-mix(in_oklch,var(--cat-hobbies)_12%,var(--surface))] dark:bg-[color-mix(in_oklch,var(--cat-hobbies)_22%,var(--ink))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--cat-hobbies)_18%,transparent)]', SIZE[size], className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small local PNGs */}
      <img src={hobbyArt(name)} alt="" width={256} height={256} className="size-full object-contain outline-none drop-shadow-[0_4px_6px_oklch(0.3_0.04_250/0.18)]" />
    </span>
  )
}

/** Three hobbies fanned out, for the empty Hobbies page. */
export function HobbyCollage() {
  return (
    <div aria-hidden className="relative h-28 w-56">
      <HobbyImage name="Drawing" size="lg" className="absolute top-4 left-0 -rotate-12" />
      <HobbyImage name="Chess" size="lg" className="absolute top-4 right-0 rotate-12" />
      <HobbyImage name="Guitar" size="lg" className="absolute top-0 left-1/2 z-10 -translate-x-1/2 shadow-2" />
    </div>
  )
}
