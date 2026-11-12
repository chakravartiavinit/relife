import brand from '@relife/brand/brand.json'
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { DeviceKind } from '@relife/contract'
import { db, schema } from '@/db'
import { createDevice, type DeviceMeta } from './devices'
import { publish } from './events'
import {
  FAILED_REDEEMS_PER_IP, FAILED_REDEEM_WINDOW_MS, MAX_CODE_ATTEMPTS, MAX_LIVE_OFFERS, MAX_PENDING_REQUESTS, OFFER_TTL_MS,
  POLL_INTERVAL_S, REQUEST_TTL_MS, mode,
} from './mode'
import { blockedFor, clearFailures, countFailure } from './ratelimit'
import { hashToken, isCode, newCode, newSecret, normalizeCode } from './tokens'
import { browserDeviceName, kindFromUa } from './names'
import { scopesFor } from './trust'

// The two pairing directions on one table (plan §3). A: a signed-in screen makes an offer (QR secret + typed code) and the
// new device redeems it. B: the new device makes a request, shows a code, and a signed-in screen approves it; the device
// polls and gets its token exactly once. Both end in one new `devices` row.

export type Pairing = typeof schema.pairings.$inferSelect
export type PairingMeta = { baseUrl?: string; requesterIp?: string; userAgent?: string; platform?: string; via?: string; lastPollAt?: number }

/** A refusal with the HTTP status and ApiError code the route will send. */
export class PairError extends Error {
  constructor(readonly code: 'bad_request' | 'not_found' | 'rate_limited' | 'expired' | 'forbidden', message: string, readonly retryAfter?: number) { super(message) }
}

const metaOf = (p: Pairing) => p.meta as PairingMeta
const live = (now: Date) => and(eq(schema.pairings.status, 'pending'), gt(schema.pairings.expiresAt, now))

async function notify(p: Pick<Pairing, 'id' | 'userId'>, status: Pairing['status']) {
  await publish({ userId: p.userId, event: { type: 'pairing', id: p.id, status } })
}

/** A code no live pairing already uses. */
async function freshCode(now: Date) {
  for (;;) {
    const code = newCode()
    const [clash] = await db.select({ id: schema.pairings.id }).from(schema.pairings).where(and(eq(schema.pairings.userCode, code), live(now))).limit(1)
    if (!clash) return code
  }
}

// ── A. Scan to connect ───────────────────────────────────────────────────────────────────────────

/** A signed-in screen shows this. Single use, 2 minutes, at most 3 live per user (older ones expire when a new one is made). */
export async function createOffer(o: { userId: string; deviceId: string | null; baseUrl: string | null; now?: Date; method?: 'offer' | 'cli' }) {
  const now = o.now ?? new Date()
  const secret = newSecret()
  const userCode = await freshCode(now)
  const keep = await db.select({ id: schema.pairings.id }).from(schema.pairings)
    .where(and(eq(schema.pairings.userId, o.userId), eq(schema.pairings.method, 'offer'), live(now)))
    .orderBy(asc(schema.pairings.createdAt))
  const drop = keep.slice(0, Math.max(0, keep.length - (MAX_LIVE_OFFERS - 1))).map((r) => r.id)
  if (drop.length) await db.update(schema.pairings).set({ status: 'expired' }).where(inArray(schema.pairings.id, drop))
  // `npm run signin` makes a `cli` offer: the same thing, but it lives 10 minutes (a person has to read the URL off a terminal).
  const method = o.method ?? 'offer'
  const [row] = await db.insert(schema.pairings).values({
    userId: o.userId, method, secretHash: hashToken(secret), userCode, scopes: ['full'], createdByDeviceId: o.deviceId,
    meta: { baseUrl: o.baseUrl ?? undefined } satisfies PairingMeta, expiresAt: new Date(now.getTime() + (method === 'cli' ? REQUEST_TTL_MS : OFFER_TTL_MS)),
  }).returning()
  return { id: row.id, secret, userCode, expiresAt: row.expiresAt, baseUrl: o.baseUrl }
}

export type Redeemed = { device: typeof schema.devices.$inferSelect; token: string; pairing: Pairing }

/**
 * The new device redeems an offer with the QR secret or the typed code. One use only: the status flips under a
 * `where status = 'pending'`, so two racing redeems cannot both win. Failures count against the IP (20 per 10 min,
 * then 429 for the rest of the window), and a wrong typed code counts against every live offer (5, then they expire).
 */
export async function redeem(o: {
  secret?: string; code?: string; kind?: DeviceKind; name?: string; platform?: string; ip: string; userAgent: string; via: string; now?: Date
}): Promise<Redeemed> {
  const now = o.now ?? new Date()
  const ipKey = `redeem:${o.ip}`
  const wait = await blockedFor(ipKey, FAILED_REDEEMS_PER_IP, FAILED_REDEEM_WINDOW_MS)
  if (wait) throw new PairError('rate_limited', 'Too many tries. Wait a few minutes.', wait)

  const fail = async (message = 'That code didn’t work. Check it, or make a new one.'): Promise<never> => {
    await countFailure(ipKey, FAILED_REDEEM_WINDOW_MS)
    throw new PairError('not_found', message)
  }

  let pairing: Pairing | undefined
  if (o.secret) {
    ;[pairing] = await db.select().from(schema.pairings).where(and(eq(schema.pairings.secretHash, hashToken(o.secret)), inArray(schema.pairings.method, ['offer', 'cli']))).limit(1)
  } else if (o.code) {
    const code = normalizeCode(o.code)
    if (isCode(code)) {
      ;[pairing] = await db.select().from(schema.pairings).where(and(eq(schema.pairings.userCode, code), inArray(schema.pairings.method, ['offer', 'cli']), live(now))).limit(1)
    }
    if (!pairing) {
      // A wrong guess is a guess against every live offer: five of them and those offers expire.
      await db.update(schema.pairings).set({ attempts: sql`${schema.pairings.attempts} + 1` })
        .where(and(inArray(schema.pairings.method, ['offer', 'cli']), live(now)))
      await db.update(schema.pairings).set({ status: 'expired' })
        .where(and(inArray(schema.pairings.method, ['offer', 'cli']), eq(schema.pairings.status, 'pending'), sql`${schema.pairings.attempts} >= ${MAX_CODE_ATTEMPTS}`))
      return fail()
    }
  }
  if (!pairing || pairing.status !== 'pending' || pairing.expiresAt <= now) return fail(`This link has expired or was already used. Make a new one on your ${brand.name}.`)
  if (!pairing.userId) return fail()

  const claimed = await db.update(schema.pairings).set({ status: 'redeemed' })
    .where(and(eq(schema.pairings.id, pairing.id), live(now))).returning()
  if (!claimed.length) return fail(`This link has expired or was already used. Make a new one on your ${brand.name}.`)

  const kind = o.kind ?? kindFromUa(o.userAgent)
  const name = o.name?.trim() || defaultName(kind, o.userAgent)
  const { device, token } = await createDevice({
    userId: pairing.userId, kind, name, scopes: scopesFor(kind), via: o.via, now,
    meta: { platform: o.platform, userAgent: o.userAgent.slice(0, 200) } satisfies DeviceMeta,
  })
  const [done] = await db.update(schema.pairings).set({ deviceId: device.id, kind, deviceName: name, meta: { ...metaOf(pairing), requesterIp: o.ip, userAgent: o.userAgent.slice(0, 200) } })
    .where(eq(schema.pairings.id, pairing.id)).returning()
  await clearFailures(ipKey)
  await notify(done, 'redeemed')
  return { device, token, pairing: done }
}

// ── B. Approve this device ───────────────────────────────────────────────────────────────────────

const REQUEST_START_LIMIT = 20

/**
 * A device asks to be let in. 10 minutes; at most 5 pending on the server; a new request with the same kind, name and
 * IP replaces the old one.
 */
export async function startRequest(o: {
  kind: DeviceKind; name: string; platform?: string; ip: string; userAgent: string; baseUrl: string; via: string; now?: Date
}) {
  const now = o.now ?? new Date()
  const key = `request:${o.ip}`
  const wait = await blockedFor(key, REQUEST_START_LIMIT, FAILED_REDEEM_WINDOW_MS)
  if (wait) throw new PairError('rate_limited', 'Too many requests. Wait a few minutes.', wait)
  await countFailure(key, FAILED_REDEEM_WINDOW_MS)

  const same = await db.select({ id: schema.pairings.id, meta: schema.pairings.meta }).from(schema.pairings)
    .where(and(eq(schema.pairings.method, 'request'), live(now), eq(schema.pairings.kind, o.kind), eq(schema.pairings.deviceName, o.name)))
  const mine = same.filter((r) => (r.meta as PairingMeta).requesterIp === o.ip).map((r) => r.id)
  if (mine.length) await db.update(schema.pairings).set({ status: 'expired' }).where(inArray(schema.pairings.id, mine))

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.pairings).where(and(eq(schema.pairings.method, 'request'), live(now)))
  if (n >= MAX_PENDING_REQUESTS) throw new PairError('rate_limited', 'Too many devices are waiting to connect. Approve or deny one, or wait a few minutes.', 60)

  const pollSecret = newSecret()
  const userCode = await freshCode(now)
  const [row] = await db.insert(schema.pairings).values({
    method: 'request', secretHash: hashToken(pollSecret), userCode, kind: o.kind, deviceName: o.name, scopes: scopesFor(o.kind),
    meta: { baseUrl: o.baseUrl, requesterIp: o.ip, userAgent: o.userAgent.slice(0, 200), platform: o.platform, via: o.via } satisfies PairingMeta,
    expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
  }).returning()
  await notify(row, 'pending')
  return { id: row.id, userCode, pollSecret, approveUrl: `${o.baseUrl}/pair/approve?r=${row.id}`, expiresAt: row.expiresAt, interval: POLL_INTERVAL_S }
}

export type PollResult =
  | { status: 'pending' | 'denied' | 'expired' }
  | { status: 'approved'; device: typeof schema.devices.$inferSelect; token: string; kind: DeviceKind }

/** A client polling faster than this gets `slow_down` (as in RFC 8628). Slightly under the 2 s interval so jitter is fine. */
const MIN_POLL_GAP_MS = 1500

export async function poll(id: string, pollSecret: string, now = new Date()): Promise<PollResult> {
  const [p] = await db.select().from(schema.pairings).where(and(eq(schema.pairings.id, id), eq(schema.pairings.method, 'request'))).limit(1)
  if (!p || !p.secretHash.equals(hashToken(pollSecret))) throw new PairError('not_found', 'This request was not found.')

  const last = metaOf(p).lastPollAt
  if (last && now.getTime() - last < MIN_POLL_GAP_MS) throw new PairError('rate_limited', 'slow_down', POLL_INTERVAL_S)
  if (p.status !== 'redeemed') await db.update(schema.pairings).set({ meta: { ...metaOf(p), lastPollAt: now.getTime() } }).where(eq(schema.pairings.id, id))

  if (p.status === 'denied') return { status: 'denied' }
  if (p.status === 'redeemed' || p.status === 'expired') return { status: 'expired' }
  if (p.expiresAt <= now) {
    await db.update(schema.pairings).set({ status: 'expired' }).where(and(eq(schema.pairings.id, id), inArray(schema.pairings.status, ['pending', 'approved'])))
    return { status: 'expired' }
  }
  if (p.status === 'pending' || !p.userId || !p.kind) return { status: 'pending' }

  // Approved: hand over the token once. The flip to redeemed decides which poll gets it.
  const claimed = await db.update(schema.pairings).set({ status: 'redeemed' }).where(and(eq(schema.pairings.id, id), eq(schema.pairings.status, 'approved'))).returning()
  if (!claimed.length) return { status: 'expired' }
  const { device, token } = await createDevice({
    userId: p.userId, kind: p.kind, name: p.deviceName ?? 'Device', scopes: p.scopes, via: metaOf(p).via, now,
    meta: { platform: metaOf(p).platform, userAgent: metaOf(p).userAgent } satisfies DeviceMeta,
  })
  await db.update(schema.pairings).set({ deviceId: device.id }).where(eq(schema.pairings.id, id))
  await notify({ id, userId: p.userId }, 'redeemed')
  return { status: 'approved', device, token, kind: p.kind }
}

/** Requests waiting to be approved, newest first. Self-host only: in the shared cloud a request is found by its code or link. */
export async function pendingRequests(now = new Date()) {
  if (mode() === 'cloud') return []
  return db.select().from(schema.pairings).where(and(eq(schema.pairings.method, 'request'), live(now), isNull(schema.pairings.userId)))
    .orderBy(sql`${schema.pairings.createdAt} desc`)
}

export async function requestById(id: string, now = new Date()) {
  const [p] = await db.select().from(schema.pairings).where(and(eq(schema.pairings.id, id), eq(schema.pairings.method, 'request'), live(now), isNull(schema.pairings.userId))).limit(1)
  return p ?? null
}

/** The typed code from a device's screen, in the dashboard's "Connect a device" dialog. Wrong tries count against the IP. */
export async function requestByCode(raw: string, ip: string, now = new Date()) {
  const key = `approve-code:${ip}`
  const wait = await blockedFor(key, FAILED_REDEEMS_PER_IP, FAILED_REDEEM_WINDOW_MS)
  if (wait) throw new PairError('rate_limited', 'Too many tries. Wait a few minutes.', wait)
  const code = normalizeCode(raw)
  const [p] = isCode(code)
    ? await db.select().from(schema.pairings).where(and(eq(schema.pairings.userCode, code), eq(schema.pairings.method, 'request'), live(now), isNull(schema.pairings.userId))).limit(1)
    : []
  if (!p) { await countFailure(key, FAILED_REDEEM_WINDOW_MS); return null }
  return p
}

export async function approveRequest(o: { id: string; userId: string; deviceId: string | null; now?: Date }) {
  const now = o.now ?? new Date()
  const rows = await db.update(schema.pairings).set({ status: 'approved', userId: o.userId, createdByDeviceId: o.deviceId })
    .where(and(eq(schema.pairings.id, o.id), eq(schema.pairings.method, 'request'), live(now), isNull(schema.pairings.userId))).returning()
  if (!rows.length) return null
  await notify(rows[0], 'approved')
  return rows[0]
}

export async function denyRequest(o: { id: string; userId: string; now?: Date }) {
  const now = o.now ?? new Date()
  const rows = await db.update(schema.pairings).set({ status: 'denied', userId: o.userId })
    .where(and(eq(schema.pairings.id, o.id), eq(schema.pairings.method, 'request'), live(now), isNull(schema.pairings.userId))).returning()
  if (rows.length) await notify(rows[0], 'denied')
  return rows.length > 0
}

/** Status of an offer for the sheet that made it, and who joined. */
export async function offerStatus(userId: string, id: string) {
  const [p] = await db.select().from(schema.pairings).where(and(eq(schema.pairings.id, id), eq(schema.pairings.userId, userId), inArray(schema.pairings.method, ['offer', 'cli']))).limit(1)
  if (!p) return null
  const status = p.status === 'pending' && p.expiresAt <= new Date() ? 'expired' : p.status
  return { status, deviceId: p.deviceId, deviceName: p.deviceName, kind: p.kind }
}

/** Housekeeping job: pairings a day after they ended, idempotency rows after 7 days, devices revoked over 30 days ago. */
export async function cleanup(now = new Date()) {
  const day = 86_400_000
  await db.delete(schema.pairings).where(lt(schema.pairings.expiresAt, new Date(now.getTime() - day)))
  await db.delete(schema.idempotency).where(lt(schema.idempotency.createdAt, new Date(now.getTime() - 7 * day)))
  await db.delete(schema.devices).where(and(lt(schema.devices.revokedAt, new Date(now.getTime() - 30 * day))))
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, new Date(now.getTime() - FAILED_REDEEM_WINDOW_MS * 2)))
}

function defaultName(kind: DeviceKind, ua: string) {
  if (kind === 'mac') return `${brand.name} for Mac`
  if (kind === 'extension') return 'Chrome extension'
  return browserDeviceName(ua)
}

