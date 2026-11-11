import { Bar } from './kit/bar'

/**
 * Shim over `Bar` (kit/bar.tsx) so the older callers restyle at once. New code uses `Bar`.
 * sm/md/lg map to 4/6/8px. PR D migrates the callers and deletes this file.
 */
export function Capsule({
  value, max = 1, color = 'var(--accent)', size = 'md', label, className,
}: {
  value: number
  max?: number
  color?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}) {
  return <Bar value={value} max={max} color={color} size={{ sm: 4, md: 6, lg: 8 }[size] as 4 | 6 | 8} label={label} className={className} />
}
