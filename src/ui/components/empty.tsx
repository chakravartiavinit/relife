import type { LucideIcon } from 'lucide-react'
import { CapsuleIcon } from './capsule-icon'
import { NotebookArt } from './line-art'

/**
 * Empty state: a picture, a title, one line and the next step. Pass `icon` (and the area `color`) for a
 * picture that says what's missing: the ReLife capsule on a halftone disc. Without it, the notebook drawing.
 */
export function EmptyState({ title, description, action, icon, color = 'var(--pill)', art }: {
  title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon; color?: string
  /** A custom picture instead of the capsule (e.g. hobby images). */
  art?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {art ? <div className="mb-5">{art}</div> : icon ? (
        <div className="relative mb-5 grid size-28 place-items-center">
          <div aria-hidden className="absolute inset-0 rounded-full" style={{ background: `color-mix(in oklch, ${color} 9%, transparent)` }} />
          <div aria-hidden className="absolute inset-2 rounded-full [mask-image:radial-gradient(circle,#000_30%,transparent_72%)]" style={{ backgroundImage: `radial-gradient(circle, color-mix(in oklch, ${color} 55%, transparent) 1.05px, transparent 1.6px)`, backgroundSize: '8px 8px' }} />
          <CapsuleIcon icon={icon} color={color} size="lg" />
        </div>
      ) : (
        <div className="relative mb-5 grid size-28 place-items-center">
          {/* Line-art on a soft sky halo, like a page lying in sunlight. */}
          <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--sky)_32%,transparent)_0%,color-mix(in_oklch,var(--pill)_10%,transparent)_55%,transparent_72%)]" />
          <NotebookArt className="relative h-16 w-auto text-line-blue" />
        </div>
      )}
      <h3 className="font-display text-[17px] font-bold tracking-[-0.015em] text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-[42ch] text-[13.5px] leading-relaxed text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
