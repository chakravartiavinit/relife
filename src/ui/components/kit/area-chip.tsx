import type { Category } from '@/db/schema'
import { AREA_ART } from '../../area-art'
import { CATEGORY } from '../../tokens'

/** An area as a 24px pill: its 3D picture and name. The tint is a mark; the text stays neutral. */
export function AreaChip({ area, label }: { area: Category; label?: string }) {
  const c = CATEGORY[area].color
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full pr-[9px] pl-1 text-[12px] leading-4 font-medium whitespace-nowrap text-ink-2"
      style={{ background: `color-mix(in srgb, ${c} 8%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 20%, transparent)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small local PNG */}
      <img src={AREA_ART[area]} alt="" width={16} height={16} className="size-4 outline-none" />
      {label ?? CATEGORY[area].label}
    </span>
  )
}
