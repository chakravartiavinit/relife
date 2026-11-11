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
  leetcode: { src: '/connectors/leetcode.svg' },
  strava: { src: '/connectors/strava.svg' },
  wakatime: { src: '/connectors/wakatime.svg' },
  monkeytype: { src: '/connectors/monkeytype.svg' },
  duolingo: { src: '/connectors/duolingo.svg' },
  todoist: { src: '/connectors/todoist.svg' },
  lastfm: { src: '/connectors/lastfm.svg' },
  steam: { src: '/connectors/steam.svg' },
  'google-calendar': { src: '/connectors/googlecalendar.svg' },
  toggl: { src: '/connectors/toggl.svg' },
  rescuetime: { src: '/connectors/rescuetime.svg' },
  hevy: { src: '/connectors/hevy.svg' },
  codewars: { src: '/connectors/codewars.svg' },
  letterboxd: { src: '/connectors/letterboxd.svg' },
  openlibrary: { src: '/connectors/openlibrary.png' },
  anki: { src: '/connectors/anki.svg' },
}
const FALLBACK_ICON: Record<string, typeof Cable> = { fx: ArrowLeftRight, laptop: MonitorSmartphone, sms: MessageSquareText, ocr: ScanText, ingest: Zap }

/** Real logo on a white tile with the 1px image outline (black 10% light, white 10% dark). */
export function AppLogo({ id, category, size = 'md' }: { id: string; category?: Category; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const logo = LOGO[id]
  const box = { xs: 'size-9 rounded-[10px]', sm: 'size-10 rounded-[11px]', md: 'size-12 rounded-[13px]', lg: 'size-14 rounded-[15px]' }[size]
  const glyph = { xs: 'size-5', sm: 'size-6', md: 'size-7', lg: 'size-8' }[size]
  if (logo) {
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center overflow-hidden bg-white shadow-[0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]', box)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local files, nothing to optimise */}
        <img src={logo.src} alt="" className={cn('outline-none', logo.fill ? 'size-full object-cover' : cn(glyph, 'object-contain'))} />
      </span>
    )
  }
  const Icon = FALLBACK_ICON[id] ?? Cable
  const cat = category ? CATEGORY[category] : undefined
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center', box)} style={{ background: cat?.wash ?? 'var(--surface-2)', color: cat?.color ?? 'var(--ink-2)' }}>
      <Icon className={size === 'sm' ? 'size-5' : 'size-6'} strokeWidth={1.75} />
    </span>
  )
}
