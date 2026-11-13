import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { and, eq, isNull, sql } from 'drizzle-orm'
import webpush from 'web-push'
import { z } from 'zod'
import { db, schema } from '@/db'
import type { NotifyCategory } from '@/domain/notify'
import type { PushMessage } from '@/domain/push'
import { env } from './env'
import { dataDir } from './paths'

// Web push: the second outbox channel. VAPID keys identify this server to the browsers' push services; each browser
// that turns push on leaves one `push_subscriptions` row. src/core/outbox.ts decides what to send and when; this file
// only delivers one message to every live subscription and drops the ones the push service says are gone.

export type VapidKeys = { publicKey: string; privateKey: string }

let keys: VapidKeys | undefined
const vapidFile = () => dataDir('vapid.json')

function readKeys(): VapidKeys {
  const j = JSON.parse(readFileSync(vapidFile(), 'utf8')) as Partial<VapidKeys>
  if (!j.publicKey || !j.privateKey) throw new Error('vapid.json is missing a key')
  return { publicKey: j.publicKey, privateKey: j.privateKey }
}

/**
 * The server's VAPID keys: RELIFE_VAPID_PUBLIC_KEY and RELIFE_VAPID_PRIVATE_KEY, else `data/vapid.json`, made on first use. The
 * file is written with `wx`, so the web and worker processes never race: the loser reads what the winner wrote. Losing the
 * file only invalidates subscriptions: the push service answers 403 or 410 and each browser shows "Turn on again".
 */
export function vapidKeys(): VapidKeys {
  const publicKey = env('RELIFE_VAPID_PUBLIC_KEY'), privateKey = env('RELIFE_VAPID_PRIVATE_KEY')
  if (publicKey && privateKey) return { publicKey, privateKey }
  if (keys) return keys
  if (existsSync(vapidFile())) return (keys = readKeys())
  mkdirSync(dataDir(), { recursive: true })
  const made = webpush.generateVAPIDKeys()
  try {
    writeFileSync(vapidFile(), JSON.stringify(made), { flag: 'wx', mode: 0o600 })
    return (keys = made)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    return (keys = readKeys())
  }
}

/** The VAPID "subject": the public https address when there is one, else a mailto the push services accept. */
export function vapidSubject() {
  const pub = env('RELIFE_PUBLIC_URL')?.trim().replace(/\/+$/, '')
  return pub && pub.startsWith('https://') ? pub : 'mailto:push@relife.invalid'
}

/** What a browser's `PushSubscription.toJSON()` holds. */
export const SubscriptionInput = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith('https://'), 'push endpoints are https'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
})
export type SubscriptionInput = z.infer<typeof SubscriptionInput>

/** Remember a browser's subscription for this device. The endpoint is unique: a browser that subscribes again moves the row to its current device. */
export async function saveSubscription(o: { userId: string; deviceId: string; sub: SubscriptionInput; via: string | null; userAgent: string | null }) {
  const S = schema.pushSubscriptions
  await db.insert(S).values({
    userId: o.userId, deviceId: o.deviceId, endpoint: o.sub.endpoint, p256dh: o.sub.keys.p256dh, auth: o.sub.keys.auth,
    via: o.via, userAgent: o.userAgent?.slice(0, 300) ?? null,
  }).onConflictDoUpdate({
    target: S.endpoint,
    set: { userId: o.userId, deviceId: o.deviceId, p256dh: o.sub.keys.p256dh, auth: o.sub.keys.auth, via: o.via, userAgent: o.userAgent?.slice(0, 300) ?? null, failures: 0, updatedAt: new Date() },
  })
}

/** Subscriptions that can still receive: their device has not been signed out. */
export function liveSubscriptions(userId: string) {
  const S = schema.pushSubscriptions
  return db.select({ sub: S }).from(S).innerJoin(schema.devices, eq(schema.devices.id, S.deviceId))
    .where(and(eq(S.userId, userId), isNull(schema.devices.revokedAt)))
    .then((rows) => rows.map((r) => r.sub))
}

export async function pushDeviceCount(userId: string) {
  const S = schema.pushSubscriptions
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(S).innerJoin(schema.devices, eq(schema.devices.id, S.deviceId))
    .where(and(eq(S.userId, userId), isNull(schema.devices.revokedAt)))
  return r?.n ?? 0
}

type Sub = typeof schema.pushSubscriptions.$inferSelect
export type PushOptions = { ttl: number; urgency: 'high' | 'normal' }
/** How long the push service may hold a message for a phone that is off, and how hard it should wake it. */
export const optionsFor = (category: NotifyCategory): PushOptions =>
  category === 'reminders' || category === 'alerts' ? { ttl: 3600, urgency: 'high' } : { ttl: 12 * 3600, urgency: 'normal' }

const GONE = new Set([403, 404, 410])
const MAX_FAILURES = 20

type Transport = (sub: Sub, body: string, o: PushOptions) => Promise<void>
const webPushTransport: Transport = async (sub, body, o) => {
  const k = vapidKeys()
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
    TTL: o.ttl, urgency: o.urgency, vapidDetails: { subject: vapidSubject(), publicKey: k.publicKey, privateKey: k.privateKey },
  })
}
/** Swapped in tests, so nothing reaches a real push service. */
export const pushTransport: { send: Transport } = { send: webPushTransport }

/** What goes over the wire: the notification, the message it belongs to and whether a repeat should buzz again. */
export type PushPayload = PushMessage & { id: string; tag: string; renotify: boolean }

/**
 * Send one message to every live subscription of the user. A 403, 404 or 410 removes the subscription (the browser forgot it,
 * or the keys changed); any other error counts a failure, and 20 in a row remove it. Returns whether at least one send worked.
 */
export async function sendPush(userId: string, payload: PushPayload, o: PushOptions): Promise<boolean> {
  const S = schema.pushSubscriptions
  let ok = false
  for (const sub of await liveSubscriptions(userId)) {
    try {
      await pushTransport.send(sub, JSON.stringify(payload), o)
      await db.update(S).set({ lastOkAt: new Date(), failures: 0 }).where(eq(S.id, sub.id))
      ok = true
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status && GONE.has(status)) { await db.delete(S).where(eq(S.id, sub.id)); continue }
      const failures = sub.failures + 1
      if (failures >= MAX_FAILURES) await db.delete(S).where(eq(S.id, sub.id))
      else await db.update(S).set({ failures }).where(eq(S.id, sub.id))
      console.error('[push] send failed:', status ?? (e instanceof Error ? e.message : e))
    }
  }
  return ok
}

/** One device's own subscription, for "Send a test to this device" (it skips the outbox, so it tests the phone itself). */
export async function sendPushToDevice(deviceId: string, payload: PushPayload) {
  const S = schema.pushSubscriptions
  const subs = await db.select().from(S).where(eq(S.deviceId, deviceId))
  let ok = false
  for (const sub of subs) {
    try {
      await pushTransport.send(sub, JSON.stringify(payload), { ttl: 300, urgency: 'high' })
      await db.update(S).set({ lastOkAt: new Date(), failures: 0 }).where(eq(S.id, sub.id))
      ok = true
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status && GONE.has(status)) await db.delete(S).where(eq(S.id, sub.id))
    }
  }
  return ok
}
