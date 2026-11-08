'use client'

import { NumberTicker } from '@/ui/beui/motion/number-ticker'
import { formatMoney } from '@/domain/money'

/**
 * Rolling-digit number for headline stats (beui.dev NumberTicker).
 * Takes serializable props so server components can use it; the formatter is built here.
 * Screen readers get the final value immediately.
 */
export function Ticker({ value, currency, decimals = 0, suffix, compact }: {
  value: number; currency?: string; decimals?: number; suffix?: string; compact?: boolean
}) {
  const format = (v: number) => currency
    ? formatMoney(v, currency, { compact, decimals: compact ? undefined : Math.abs(value) >= 1000 ? 0 : decimals })
    : new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v)
  // Roll as soon as the page loads, not when scrolled into view: a number waiting below the fold showed 0s, which
  // reads as a real value. With reduced motion the digits land at once.
  return <NumberTicker value={value} decimals={decimals} format={format} suffix={suffix} duration={0.8} stagger={0.03} startOnView={false} />
}
