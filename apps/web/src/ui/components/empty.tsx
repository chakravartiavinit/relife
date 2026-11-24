import type { LucideIcon } from 'lucide-react'
import type { PictureRef } from '../picture'
import { CapsuleIcon } from './capsule-icon'
import { NotebookArt } from './line-art'
import { Picture } from './picture'

/**
 * Empty state: a 3D picture, one line that says what will appear, and up to two actions (`action` the main one,
 * `secondary` the other). Pass `picture` (a `Picture` ref: a routine, hobby, category or area picture) for the 3D
 * picture. Older callers still pass `icon` (the ReLife capsule alone) or `art`; without any of them, the notebook drawing.
 */
export function EmptyState({ title, description, action, secondary, picture, icon, color = 'var(--pill)', art }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; secondary?: React.ReactNode
  picture?: PictureRef; icon?: LucideIcon; color?: string
  /** A custom picture instead of the capsule (e.g. hobby images). */
  art?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-7 text-center">
      <div className="mb-1">
        {art ?? (picture ? <Picture {...picture} size={56} /> : icon ? <CapsuleIcon icon={icon} color={color} size="lg" /> : <NotebookArt className="h-14 w-auto text-ink-3" />)}
      </div>
      <h3 className="font-display text-heading text-ink">{title}</h3>
      {description ? <p className="max-w-[42ch] text-small text-ink-3">{description}</p> : null}
      {action || secondary ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}{secondary}</div> : null}
    </div>
  )
}
