import { Trophy } from 'lucide-react'
import { ACHIEVEMENT_ICON, TIER_COLOR } from '../achievement-icons'
import { pictureSpec, type PictureRef } from '../picture'
import { cn } from '../cn'
import { BrandLogo } from './brand-logo'
import { CoinLogo } from './coin-logo'

// The picture slot of a row, card, toast or peek header: what `pictureSpec` resolved, drawn at one of three sizes.
// 20 is inline (a toast, a line of text), 32 the row slot, 40 a lead row, 56 an empty state or a Peek header. Use one size per list so the pictures
// line up in a column. Decorative (`alt=""`) because the name is always beside it; pass `label` where it is not.

export type PictureSize = 20 | 32 | 40 | 56

const BOX: Record<PictureSize, string> = { 20: 'size-5', 32: 'size-8', 40: 'size-10', 56: 'size-14' }
const ROUND: Record<PictureSize, string> = { 20: 'rounded-sm', 32: 'rounded-md', 40: 'rounded-md', 56: 'rounded-lg' }
const GLYPH: Record<PictureSize, string> = { 20: 'size-3', 32: 'size-[18px]', 40: 'size-6', 56: 'size-8' }
const ART: Record<PictureSize, string> = { 20: 'size-[18px]', 32: 'size-7', 40: 'size-9', 56: 'size-14' }
const LETTER: Record<PictureSize, string> = { 20: 'text-caption', 32: 'text-small', 40: 'text-body', 56: 'text-heading' }
const MEDAL_ICON: Record<PictureSize, string> = { 20: 'size-2.5', 32: 'size-4', 40: 'size-5', 56: 'size-7' }
const COIN: Record<PictureSize, string> = { 20: 'size-5 text-caption', 32: 'size-8 text-caption', 40: 'size-10 text-caption', 56: 'size-14 text-small' }
const COIN_LETTERS: Record<PictureSize, number> = { 20: 1, 32: 2, 40: 3, 56: 3 }

export function Picture({ size = 32, label, className, ...ref }: PictureRef & { size?: PictureSize; label?: string; className?: string }) {
  const s = pictureSpec(ref as PictureRef)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  switch (s.type) {
    case 'logo':
      return (
        <span {...a11y} className={cn('grid shrink-0 place-items-center overflow-hidden bg-white shadow-[0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]', BOX[size], ROUND[size], className)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG/PNG files */}
          <img src={s.src} alt="" className={cn('outline-none', s.fill ? 'size-full object-cover' : cn(GLYPH[size], 'object-contain'))} />
        </span>
      )
    case 'art':
      return (
        <span {...a11y} className={cn('grid shrink-0 place-items-center', BOX[size], s.lit && cn('dark:bg-[color-mix(in_oklch,var(--cat-hobbies)_22%,var(--ink))]', ROUND[size]), className)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small local PNGs */}
          <img src={s.src} alt="" width={256} height={256} className={cn('object-contain outline-none', ART[size])} />
        </span>
      )
    case 'cover':
      return (
        <span {...a11y} className={cn('block shrink-0 overflow-hidden bg-surface-2', BOX[size], ROUND[size], className)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local file from /api/library */}
          <img src={s.src} alt="" className="size-full object-cover" />
        </span>
      )
    case 'coin':
      return <CoinLogo symbol={s.symbol} logo={s.logo} letters={COIN_LETTERS[size]} className={cn(COIN[size], className)} />
    case 'medal': {
      const Icon = ACHIEVEMENT_ICON[s.key] ?? Trophy
      const c = TIER_COLOR[s.tier]
      return (
        <span
          {...a11y}
          className={cn('grid shrink-0 place-items-center rounded-full', BOX[size], className)}
          style={s.unlocked
            ? { color: 'white', background: c, boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, ${c} 72%, black)` }
            : { color: `color-mix(in oklch, ${c} 70%, var(--ink-3))`, background: `color-mix(in oklch, ${c} 12%, var(--surface-2))`, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
        >
          <Icon className={MEDAL_ICON[size]} strokeWidth={2} />
        </span>
      )
    }
    case 'letter':
      return <BrandLogo name={s.name} className={cn(BOX[size], ROUND[size], LETTER[size], className)} />
  }
}
