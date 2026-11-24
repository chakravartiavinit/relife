import type { DeviceKind } from '@relife/contract'
import { cn } from '@/ui/cn'
import { Picture } from '../picture'

// One picture and one name per kind of device, on every surface (plan glossary).

export const KIND: Record<DeviceKind, { label: string }> = {
  browser: { label: 'Browser' }, mac: { label: 'Mac app' }, extension: { label: 'Chrome extension' }, phone: { label: 'Phone' }, cli: { label: 'Command line' },
}

/** A phone or a laptop in 3D (a command line runs on a laptop too); a stale device is dimmed. 40px, the lead-row slot. */
const DEVICE_NAME: Record<DeviceKind, string> = { browser: 'Browser', mac: 'Mac', extension: 'Extension', phone: 'Phone', cli: 'Laptop' }

export function DeviceTile({ kind, className, quiet }: { kind: DeviceKind; className?: string; quiet?: boolean }) {
  return <Picture of="device" name={DEVICE_NAME[kind]} size={40} className={cn(quiet && 'opacity-60', className)} />
}
