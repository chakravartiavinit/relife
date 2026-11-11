import { ArrowLeftRight, MessageSquareText, MonitorSmartphone, Cable, ScanText, Zap } from 'lucide-react'
import type { Category } from '@/db/schema'
import { CATEGORY } from '../tokens'
import { cn } from '../cn'

// Brand logos live in public/connectors (see its README for sources and licences). App-icon PNGs
// (Blinkit, Zepto, Flipkart) fill their tile; glyph SVGs sit on white.
export const LOGO: Record<string, { src: string; fill?: boolean }> = {
  github: { src: '/connectors/github.svg' },
  binance: { src: '/connectors/binance.svg' },
  lichess: { src: '/connectors/lichess.svg' },
  codeforces: { src: '/connectors/codeforces.png' },
  codechef: { src: '/connectors/codechef.svg' },
  atcoder: { src: '/connectors/atcoder.png', fill: true },
  chesscom: { src: '/connectors/chessdotcom.svg' },
  'icloud-inbox': { src: '/connectors/icloud.svg' },
  telegram: { src: '/connectors/telegram.svg' },
  anthropic: { src: '/connectors/anthropic.svg' },
  openai: { src: '/connectors/openai.svg' },
  google: { src: '/connectors/gemini.svg' },
  openrouter: { src: '/connectors/openrouter.svg' },
  local: { src: '/connectors/ollama.svg' },
  swiggy: { src: '/connectors/swiggy.svg' },
  zomato: { src: '/connectors/zomato.svg' },
  amazon: { src: '/connectors/amazon.svg' },
  blinkit: { src: '/connectors/blinkit.png', fill: true },
  zepto: { src: '/connectors/zepto.png', fill: true },
  flipkart: { src: '/connectors/flipkart.png', fill: true },
  makemytrip: { src: '/connectors/makemytrip.png' },
}
const FALLBACK_ICON: Record<string, typeof Cable> = { fx: ArrowLeftRight, laptop: MonitorSmartphone, sms: MessageSquareText, ocr: ScanText, ingest: Zap }

/** Real logo on a white tile with a hairline ring (`.logo` in the mockups; white so dark glyphs stay readable). */
export function AppLogo({ id, category, size = 'md' }: { id: string; category?: Category; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const logo = LOGO[id]
  const box = { xs: 'size-9 rounded-md', sm: 'size-10 rounded-md', md: 'size-12 rounded-lg', lg: 'size-14 rounded-lg' }[size]
  const glyph = { xs: 'size-5', sm: 'size-6', md: 'size-7', lg: 'size-8' }[size]
  if (logo) {
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center overflow-hidden bg-white shadow-inset', box)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local files, nothing to optimise */}
        <img src={logo.src} alt="" className={cn('outline-none', logo.fill ? 'size-full object-cover' : cn(glyph, 'object-contain'))} />
      </span>
    )
  }
  const Icon = FALLBACK_ICON[id] ?? Cable
  const cat = category ? CATEGORY[category] : undefined
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center', box)} style={{ background: cat?.wash ?? 'var(--raised-2)', color: cat?.color ?? 'var(--text-2)' }}>
      <Icon className={size === 'sm' ? 'size-5' : 'size-6'} strokeWidth={1.75} />
    </span>
  )
}
