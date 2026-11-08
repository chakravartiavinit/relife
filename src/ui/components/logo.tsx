/* eslint-disable @next/next/no-img-element -- static brand PNGs from public/brand, nothing to optimise */
import { cn } from '../cn'
import { BRAND } from '../brand-files'

// The ReLIFE logo (public/brand, built by scripts/brand.mjs). Black letters in light mode,
// white letters in dark mode; the capsule keeps its colours in both. No image outline: it's a transparent logo.
const RATIO = BRAND.ratio

/** Full logo with the リライフ kana. `className` sets the height, e.g. "h-8". */
export function Wordmark({ className }: { className?: string; kana?: boolean }) {
  return (
    <span className={cn('relative inline-block h-8', className)} style={{ aspectRatio: RATIO }}>
      <img src={BRAND['logo-light']} alt="ReLife" className="absolute inset-0 h-full w-full outline-none dark:hidden" />
      <img src={BRAND['logo-dark']} alt="ReLife" className="absolute inset-0 hidden h-full w-full outline-none dark:block" />
    </span>
  )
}

/** The capsule on its own, for icons. */
export function CapsuleMark({ className, title }: { className?: string; title?: string }) {
  return <img src={BRAND['icon-192']} alt={title ?? ''} aria-hidden={title ? undefined : true} className={cn('rounded-[22%]', className)} />
}
