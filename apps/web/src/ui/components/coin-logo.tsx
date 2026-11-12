import { cn } from '../cn'

// A coin's round logo from data/coins (see core/coin-logos.ts), or its first letters on a tint
// picked from the symbol, so a coin looks the same everywhere.

const SIZE = { sm: 'size-6 text-[9px]', md: 'size-9 text-[11px]', lg: 'size-11 text-[13px]' }

export function CoinLogo({ symbol, logo, size = 'md', className }: { symbol: string; logo?: boolean; size?: keyof typeof SIZE; className?: string }) {
  if (logo) {
    return (
      // v=2 in the URL: the 250px logos, past a week-old browser cache.
      // eslint-disable-next-line @next/next/no-img-element -- small local file from /api/coins
      <img src={`/api/coins/${encodeURIComponent(symbol)}?v=2`} alt="" className={cn('shrink-0 rounded-full bg-white object-cover outline outline-1 -outline-offset-1 outline-[oklch(0_0_0/0.1)] dark:outline-[oklch(1_0_0/0.25)]', SIZE[size], className)} />
    )
  }
  const h = [...symbol].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full font-display font-bold tracking-tight text-[oklch(0.42_0.11_var(--h))] bg-[oklch(0.93_0.045_var(--h))] dark:text-[oklch(0.85_0.08_var(--h))] dark:bg-[oklch(0.33_0.06_var(--h))]', SIZE[size], className)}
      style={{ '--h': h } as React.CSSProperties}
    >
      {symbol.slice(0, 3)}
    </span>
  )
}
