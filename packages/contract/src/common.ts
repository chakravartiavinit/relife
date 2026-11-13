import { z } from 'zod'

export const DEVICE_KINDS = ['browser', 'phone', 'mac', 'extension', 'cli'] as const
export const DeviceKind = z.enum(DEVICE_KINDS)
export type DeviceKind = z.infer<typeof DeviceKind>

/** `full`: dashboard, phone, Mac, CLI. `companion`: the extension (activity, Today). `ingest`: Shortcuts. */
export const SCOPES = ['full', 'companion', 'ingest'] as const
export const Scope = z.enum(SCOPES)
export type Scope = z.infer<typeof Scope>

/** Same list as ACTIVITY_KINDS in apps/web (a test there keeps the two equal). */
export const ACTIVITY_KINDS = ['learning', 'work', 'entertainment', 'social', 'communication', 'shopping', 'news', 'other'] as const
export const ActivityKind = z.enum(ACTIVITY_KINDS)
export type ActivityKind = z.infer<typeof ActivityKind>

export const DeviceInfo = z.object({
  id: z.string(),
  kind: DeviceKind,
  name: z.string(),
  scopes: z.array(Scope),
})
export type DeviceInfo = z.infer<typeof DeviceInfo>

export const API_ERROR_CODES = ['unauthorized', 'revoked', 'expired', 'forbidden', 'bad_request', 'rate_limited', 'not_found', 'unavailable'] as const
export const ApiError = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(API_ERROR_CODES), message: z.string() }),
})
export type ApiError = z.infer<typeof ApiError>
