import { Brain, Code, HeartPulse, Palette, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { Category } from '@/db/schema'
import { cn } from '../cn'

// The ReLIFE capsule from the logo, used as the app's icon shape: a tilted pill with an ink outline,
// the top in colour and the bottom white. Area pages, the character banner and setup use it.

/** Each area's line icon, the same on its page, the character banner and setup. */
export const AREA_ICON: Record<Category, LucideIcon> = { health: HeartPulse, mind: Brain, skills: Code, wealth: Wallet, hobbies: Palette, relationships: Users }

const SIZE = {
  sm: { box: 'h-12 w-[30px]', icon: 'size-3.5', text: 'text-[13px]' },
  md: { box: 'h-[60px] w-[38px]', icon: 'size-[18px]', text: 'text-[17px]' },
  lg: { box: 'h-[72px] w-[46px]', icon: 'size-5', text: 'text-[21px]' },
}

export function CapsuleIcon({ color = 'var(--pill)', icon: Icon, letter, size = 'md', className }: {
  color?: string; icon?: LucideIcon; letter?: string; size?: keyof typeof SIZE; className?: string
}) {
  const s = SIZE[size]
  return (
    <span aria-hidden className={cn('relative inline-flex shrink-0 -rotate-[14deg] flex-col overflow-hidden rounded-full bg-[oklch(1_0_0)] shadow-[0_0_0_2px_oklch(0.178_0_0),0_8px_18px_-8px_oklch(0.2_0.05_250/0.45)] dark:bg-[oklch(0.96_0_0)]', s.box, className)}>
      <span className="grid flex-[1.15] place-items-center text-white" style={{ background: `linear-gradient(160deg, color-mix(in oklch, ${color} 70%, white), ${color})` }}>
        {/* Counter-rotate the glyph so it reads upright inside the tilted capsule. */}
        <span className="rotate-[14deg]">
          {Icon ? <Icon className={s.icon} strokeWidth={2.25} /> : <span className={cn('font-display font-extrabold leading-none', s.text)}>{letter}</span>}
        </span>
      </span>
      <span className="flex-1 border-t-2 border-[oklch(0.178_0_0)]" />
    </span>
  )
}
