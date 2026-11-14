'use server'

import brand from '@relife/brand/brand.json'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db, schema } from '@/db'
import { DEMO_MESSAGE, isDemo } from '@/core/demo'
import { hostName } from '@/core/hosts'
import { requireDevice } from '@/core/auth/viewer'
import { saveSubscription, sendPushToDevice, SubscriptionInput, vapidKeys } from '@/core/push'

// Server actions behind "Push on this device" (You › Notifications and the phone page). Like devices-actions.ts, every one
// needs a signed-in browser, and a subscription is bound to that browser's own device. The read-only demo refuses them all
// (the gate already does for server actions; the checks here keep it true if the gate is ever bypassed, and keep the demo from making VAPID keys).

/** The key a browser subscribes with (`applicationServerKey`). */
export async function pushPublicKey() {
  if (isDemo()) throw new Error(DEMO_MESSAGE)
  await requireDevice()
  return vapidKeys().publicKey
}

export async function savePushSubscription(sub: unknown) {
  if (isDemo()) return { ok: false as const, error: DEMO_MESSAGE }
  const device = await requireDevice()
  const parsed = SubscriptionInput.safeParse(sub)
  if (!parsed.success) return { ok: false as const, error: 'The browser sent a subscription that could not be read.' }
  const h = await headers()
  const host = h.get('host')
  const saved = await saveSubscription({ userId: device.userId, deviceId: device.id, sub: parsed.data, via: host ? hostName(host) : null, userAgent: h.get('user-agent') })
  if (!saved) return { ok: false as const, error: 'That subscription belongs to another account. Turn push off in the browser and on again.' }
  return { ok: true as const }
}

/** Whether the server still holds this browser's subscription (it drops one the push service reports gone). */
export async function pushSubscribed(endpoint: string) {
  const device = await requireDevice()
  const S = schema.pushSubscriptions
  const [row] = await db.select({ id: S.id }).from(S).where(and(eq(S.endpoint, endpoint.slice(0, 1000)), eq(S.deviceId, device.id))).limit(1)
  return !!row
}

export async function removePushSubscription(endpoint: string) {
  if (isDemo()) return { ok: false as const, error: DEMO_MESSAGE }
  const device = await requireDevice()
  const S = schema.pushSubscriptions
  await db.delete(S).where(and(eq(S.endpoint, endpoint.slice(0, 1000)), eq(S.deviceId, device.id)))
  return { ok: true as const }
}

/** Straight to this device's subscription, past the outbox (no quiet hours, no cap), so it tests the phone itself. */
export async function sendTestPush() {
  if (isDemo()) return { ok: false as const, error: DEMO_MESSAGE }
  const device = await requireDevice()
  const ok = await sendPushToDevice(device.id, {
    id: crypto.randomUUID(), tag: 'test', renotify: false,
    title: `${brand.name} test`, body: 'If you can read this, notifications reach this device.', url: '/you/notifications', actions: [],
  })
  return ok ? { ok: true as const } : { ok: false as const, error: 'The push service did not take it. Turn push off and on again on this device.' }
}
