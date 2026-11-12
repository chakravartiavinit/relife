import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { DeviceKind, Scope } from '@relife/contract'
import { db, schema } from '@/db'
import { env } from '../env'
import { cacheGet, cachePut, forgetDevice } from './cache'
import { publish } from './events'
import { CACHE_MS, DEVICE_TTL_MS, TOUCH_EVERY_MS } from './mode'
import { hashToken, makeToken } from './tokens'

export type Device = typeof schema.devices.$inferSelect
export type DeviceMeta = { appVersion?: string; platform?: string; userAgent?: string; legacy?: boolean; watcher?: boolean }

/** A legacy row (the shared ACTIVITY_TOKEN or INGEST_TOKEN) has no expiry. */
const FOREVER = new Date('2999-01-01T00:00:00Z')

export async function createDevice(o: {
  userId: string; kind: DeviceKind; name: string; scopes: Scope[]; via?: string | null; meta?: DeviceMeta; now?: Date
}) {
  const { token, hash } = makeToken(o.kind)
  const now = o.now ?? new Date()
  const [device] = await db.insert(schema.devices).values({
    userId: o.userId, kind: o.kind, name: o.name.trim().slice(0, 80) || 'Device', scopes: o.scopes, tokenHash: hash,
    via: o.via ?? null, meta: o.meta ?? {}, lastSeenAt: now, expiresAt: new Date(now.getTime() + DEVICE_TTL_MS),
  }).returning()
  return { device, token }
}

export type Found =
  | { ok: true; device: Device }
  | { ok: false; reason: 'invalid' | 'revoked' | 'expired' }

/** The device behind a token. Valid ones are cached for 30 s; failures never are, so a revoke shows at once. */
export async function findByToken(token: string, now = new Date()): Promise<Found> {
  const hash = hashToken(token)
  const key = hash.toString('hex')
  const hit = cacheGet(key, now.getTime())
  if (hit) return { ok: true, device: hit }
  const [device] = await db.select().from(schema.devices).where(eq(schema.devices.tokenHash, hash)).limit(1)
  if (!device) return { ok: false, reason: 'invalid' }
  if (device.revokedAt) return { ok: false, reason: 'revoked' }
  if (device.expiresAt <= now) return { ok: false, reason: 'expired' }
  cachePut(key, device, CACHE_MS, now.getTime())
  return { ok: true, device }
}

/**
 * Write `last_seen_at` and push `expires_at` 180 days out, at most once per 5 minutes per device. Returns whether it
 * wrote, so a browser's cookie can be re-set with a fresh Max-Age at the same time.
 */
export async function touchIfDue(device: Device, now = new Date()) {
  if (device.lastSeenAt && now.getTime() - device.lastSeenAt.getTime() < TOUCH_EVERY_MS) return false
  const legacy = !!(device.meta as DeviceMeta).legacy
  const rows = await db.update(schema.devices)
    .set({ lastSeenAt: now, ...(legacy ? {} : { expiresAt: new Date(now.getTime() + DEVICE_TTL_MS) }) })
    .where(and(
      eq(schema.devices.id, device.id), isNull(schema.devices.revokedAt),
      or(isNull(schema.devices.lastSeenAt), lt(schema.devices.lastSeenAt, new Date(now.getTime() - TOUCH_EVERY_MS))),
    )).returning({ id: schema.devices.id })
  device.lastSeenAt = now // the cached row learns it too
  return rows.length > 0
}

export const listDevices = (userId: string) =>
  db.select().from(schema.devices).where(and(eq(schema.devices.userId, userId), isNull(schema.devices.revokedAt)))
    .orderBy(desc(schema.devices.lastSeenAt), desc(schema.devices.createdAt))

/** Sign a device out for good. Returns false when it is not this user's or already gone. */
export async function revokeDevice(userId: string, id: string) {
  const rows = await db.update(schema.devices).set({ revokedAt: new Date() })
    .where(and(eq(schema.devices.id, id), eq(schema.devices.userId, userId), isNull(schema.devices.revokedAt)))
    .returning({ id: schema.devices.id })
  if (!rows.length) return false
  forgetDevice(id)
  await publish({ userId, event: { type: 'device.revoked', id } })
  return true
}

export async function renameDevice(userId: string, id: string, name: string) {
  const n = name.trim().slice(0, 80)
  if (!n) return false
  const rows = await db.update(schema.devices).set({ name: n })
    .where(and(eq(schema.devices.id, id), eq(schema.devices.userId, userId), isNull(schema.devices.revokedAt)))
    .returning({ id: schema.devices.id })
  forgetDevice(id) // the cached copy has the old name
  return rows.length > 0
}

/** Merge into meta (app version, platform, watcher flag). */
export async function updateMeta(id: string, patch: DeviceMeta) {
  await db.update(schema.devices).set({ meta: sql`${schema.devices.meta} || ${JSON.stringify(patch)}::jsonb` }).where(eq(schema.devices.id, id))
  forgetDevice(id)
}

// ── Legacy shared tokens ─────────────────────────────────────────────────────────────────────────

const LEGACY: { env: string; kind: DeviceKind; scope: Scope; name: string }[] = [
  { env: 'ACTIVITY_TOKEN', kind: 'extension', scope: 'companion', name: 'Chrome extension (old token)' },
  { env: 'INGEST_TOKEN', kind: 'cli', scope: 'ingest', name: 'Shortcuts (old token)' },
]

/**
 * The shared ACTIVITY_TOKEN and INGEST_TOKEN become one device row each (`meta.legacy`, no expiry, scope `companion`
 * or `ingest`), so old extensions and Shortcuts keep working through the same checks as everything else. Run when keys
 * are loaded. A row the owner removed stays removed (it is revoked, and matched by its hash); a changed or cleared token
 * deletes the old row.
 */
export async function syncLegacyTokens(userId: string, get: (name: string) => string | undefined = env) {
  for (const l of LEGACY) {
    const value = get(l.env)?.trim()
    const mine = await db.select().from(schema.devices).where(and(
      eq(schema.devices.userId, userId), sql`${schema.devices.meta}->>'legacy' = 'true'`, sql`${l.scope} = any(${schema.devices.scopes})`,
    ))
    const hash = value ? hashToken(value) : null
    for (const d of mine) {
      if (hash && d.tokenHash.equals(hash)) continue
      await db.delete(schema.devices).where(eq(schema.devices.id, d.id)) // a retired token: nothing left to keep
      forgetDevice(d.id)
    }
    if (!hash || mine.some((d) => d.tokenHash.equals(hash))) continue // none, or already there (revoked included)
    const [clash] = await db.select({ id: schema.devices.id }).from(schema.devices).where(eq(schema.devices.tokenHash, hash)).limit(1)
    if (clash) continue
    await db.insert(schema.devices).values({
      userId, kind: l.kind, name: l.name, scopes: [l.scope], tokenHash: hash, meta: { legacy: true }, expiresAt: FOREVER,
    })
  }
}

/** When an extension last reached the server (replaces the old `extension` heartbeat). */
export async function extensionLastSeen(userId: string) {
  const [r] = await db.select({ at: sql<Date | null>`max(${schema.devices.lastSeenAt})` }).from(schema.devices)
    .where(and(eq(schema.devices.userId, userId), eq(schema.devices.kind, 'extension'), isNull(schema.devices.revokedAt)))
  return r?.at ? new Date(r.at) : null
}
