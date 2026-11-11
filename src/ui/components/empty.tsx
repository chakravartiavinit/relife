import type { LucideIcon } from 'lucide-react'
import { IconTile } from './routine-art'

/**
 * Empty state: a 48px tile, a title, one line and the next step. Pass `src` (an area or routine picture) or `icon`
 * (and the area `color`) for a tile that says what's missing; without either it shows the sparkles.
 */
export function EmptyState({ title, description, action, icon: Icon, src = '/routines/sparkles.png', color = 'var(--accent)', art }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon; src?: string; color?: string
  /** A custom picture instead of the tile (e.g. hobby images). */
  art?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4">
        {art ?? (Icon ? <IconTile tint={color} size="base"><Icon className="size-5" strokeWidth={1.75} style={{ color }} /></IconTile> : <IconTile src={src} tint={color} size="base" />)}
      </div>
      <h3 className="t-row">{title}</h3>
      {description ? <p className="t-meta mt-1 max-w-[42ch] text-[13px] leading-5">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
