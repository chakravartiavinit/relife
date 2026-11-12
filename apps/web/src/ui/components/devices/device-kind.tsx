import { Laptop, Monitor, Puzzle, Smartphone, Terminal, type LucideIcon } from 'lucide-react'
import type { DeviceKind } from '@relife/contract'
import { cn } from '@/ui/cn'

// One picture and one name per kind of device, on every surface (plan glossary).

export const KIND: Record<DeviceKind, { icon: LucideIcon; label: string }> = {
  browser: { icon: Monitor, label: 'Browser' },
  mac: { icon: Laptop, label: 'Mac app' },
  extension: { icon: Puzzle, label: 'Chrome extension' },
  phone: { icon: Smartphone, label: 'Phone' },
  cli: { icon: Terminal, label: 'Command line' },
}

/** The kind's icon in a tinted tile, like the nav rows (concentric: 40px tile, 12px radius). */
export function DeviceTile({ kind, className, quiet }: { kind: DeviceKind; className?: string; quiet?: boolean }) {
  const Icon = KIND[kind].icon
  return (
    <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-[12px]', quiet ? 'bg-surface-2 text-ink-2' : 'bg-pill-wash text-pill-ink', className)}>
      <Icon className="size-5" strokeWidth={1.5} />
    </span>
  )
}
