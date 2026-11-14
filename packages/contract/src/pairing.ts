import { z } from 'zod'
import { DeviceInfo, Scope } from './common'

/** The kinds a new device may ask for. `cli` pairs only from the server's shell. */
const PairKind = z.enum(['mac', 'extension', 'phone', 'browser'])

/** POST /api/v1/pair/redeem: flow A, a QR secret or the typed XXXX-XXXX code. */
export const PairRedeem = z.object({
  secret: z.string().optional(),
  code: z.string().trim().min(8).max(16).optional(),
  kind: PairKind.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  platform: z.string().max(80).optional(),
  /** Asks for less than the kind's default (the Android app asks for `['ingest']`). It can only narrow, never widen. */
  scopes: z.array(Scope).min(1).max(3).optional(),
}).refine((v) => v.secret || v.code, { message: 'secret or code is required' })
export type PairRedeem = z.infer<typeof PairRedeem>

/** Browsers get the cookie and `next`; native clients get `token` in the body. */
export const PairRedeemResult = z.object({
  ok: z.literal(true),
  device: DeviceInfo,
  token: z.string().optional(),
  next: z.string().optional(),
})
export type PairRedeemResult = z.infer<typeof PairRedeemResult>

/** POST /api/v1/pair/requests: flow B, the new device shows a code a signed-in screen approves. */
export const PairRequestStart = z.object({
  kind: PairKind,
  name: z.string().trim().min(1).max(80),
  platform: z.string().max(80).optional(),
  scopes: z.array(Scope).min(1).max(3).optional(),
})
export type PairRequestStart = z.infer<typeof PairRequestStart>

export const PairRequestStarted = z.object({
  id: z.string(),
  /** 8 Crockford base32 characters, shown as XXXX-XXXX. */
  userCode: z.string(),
  pollSecret: z.string(),
  approveUrl: z.string(),
  expiresAt: z.iso.datetime(),
  /** Seconds between polls. */
  interval: z.number(),
})
export type PairRequestStarted = z.infer<typeof PairRequestStarted>

/** POST /api/v1/pair/requests/:id/poll. `approved` (with the token) comes back exactly once. */
export const PairPoll = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }),
  z.object({ status: z.literal('denied') }),
  z.object({ status: z.literal('expired') }),
  z.object({ status: z.literal('approved'), token: z.string().optional(), device: DeviceInfo }),
])
export type PairPoll = z.infer<typeof PairPoll>

/**
 * POST /api/v1/pair/join: someone opens an invite link (`/join#s=<secret>`) and picks a name. One use: it makes a new
 * person on this server (a member), signs this browser in as them and answers with where to go next.
 */
export const PairJoin = z.object({
  secret: z.string().min(16).max(200),
  name: z.string().trim().min(1).max(60),
  /** IANA name from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Wrong or missing: the server's. */
  timezone: z.string().max(80).optional(),
})
export type PairJoin = z.infer<typeof PairJoin>

export const PairJoinResult = z.object({
  ok: z.literal(true),
  device: DeviceInfo,
  next: z.string(),
})
export type PairJoinResult = z.infer<typeof PairJoinResult>
