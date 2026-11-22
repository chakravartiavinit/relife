import type { LucideIcon } from 'lucide-react'
import { CapsuleIcon } from './capsule-icon'
import { NotebookArt } from './line-art'

/**
 * Empty state: a picture, a title, one line and the next step. Pass `icon` (and the area `color`) for a
 * picture that says what's missing: the ReLife capsule alone. Without it, the notebook drawing.
 */
export function EmptyState({ title, description, action, icon, color = 'var(--pill)', art }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon; color?: string
  /** A custom picture instead of the capsule (e.g. hobby images). */
  art?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-5">
        {art ?? (icon ? <CapsuleIcon icon={icon} color={color} size="lg" /> : <NotebookArt className="h-16 w-auto text-ink-3" />)}
      </div>
      <h3 className="text-heading text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-[42ch] text-small text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
