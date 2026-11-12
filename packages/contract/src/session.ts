import { z } from 'zod'
import { DeviceInfo } from './common'

/** GET /api/v1/hello: public. Lets a client check it found a ReLife server and whether it is new enough. */
export const Hello = z.object({
  app: z.literal('relife'),
  apiVersion: z.literal(1),
  version: z.string(),
  mode: z.enum(['self-host', 'cloud']),
  /** Owner's first name, only with a valid device token. */
  name: z.string().nullable(),
  minClient: z.object({ extension: z.string(), mac: z.string() }),
})
export type Hello = z.infer<typeof Hello>

export const THEMES = ['light', 'dark', 'system'] as const

/** GET /api/v1/me: who this device signs in as, and the account state every surface shares. */
export const Me = z.object({
  name: z.string(),
  timezone: z.string(),
  prefs: z.object({ theme: z.enum(THEMES) }),
  device: DeviceInfo,
})
export type Me = z.infer<typeof Me>

/** GET /api/v1/events: one Server-Sent Events stream. Each event's JSON data is one of these. */
export const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.string() }),
  z.object({ type: z.literal('data'), version: z.string() }),
  z.object({ type: z.literal('pairing'), id: z.string(), status: z.enum(['pending', 'approved', 'redeemed', 'denied', 'expired']) }),
  z.object({ type: z.literal('device.revoked'), id: z.string() }),
  z.object({ type: z.literal('ping') }),
])
export type Event = z.infer<typeof Event>
