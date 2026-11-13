import { BRAND } from '@/lib/brand-files'
import { NAME } from '@/lib/site'

/** The logo from packages/brand (light only on this site). `priority` hints the nav logo as LCP-adjacent. */
export function Wordmark({ height = 34 }: { height?: number }) {
  return <img src={BRAND['logo-light']} alt={NAME} className="logo" width={Math.round(height * BRAND.ratio)} height={height} style={{ height }} fetchPriority="high" />
}

export function CapsuleMark({ size = 24 }: { size?: number }) {
  return <img src={BRAND['icon-192']} alt="" aria-hidden width={size} height={size} style={{ borderRadius: '22%' }} />
}
