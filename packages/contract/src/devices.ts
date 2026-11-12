import { z } from 'zod'
import { DeviceInfo } from './common'

/** One row of GET /api/v1/devices: what Settings → Devices shows. */
export const DeviceListItem = DeviceInfo.extend({
  /** The host the device paired through, such as `127.0.0.1` or `mac.tailnet.ts.net`. */
  via: z.string().nullable(),
  lastSeenAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** The device that made this request. */
  current: z.boolean(),
  /** The shared ACTIVITY_TOKEN or INGEST_TOKEN, kept so old clients keep working. */
  legacy: z.boolean(),
  appVersion: z.string().nullable(),
  platform: z.string().nullable(),
})
export type DeviceListItem = z.infer<typeof DeviceListItem>

export const DeviceList = z.object({ devices: z.array(DeviceListItem) })
export type DeviceList = z.infer<typeof DeviceList>

/** PATCH /api/v1/devices/:id */
export const DeviceRename = z.object({ name: z.string().trim().min(1).max(80) })
export type DeviceRename = z.infer<typeof DeviceRename>
