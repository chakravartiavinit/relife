import type { Event } from '@relife/contract'
import { sql as pg } from '@/db'
import { dataVersionFor } from '../data-version'
import { hasMembers, ownerId } from '../multi-user'
import { forgetDevice } from './cache'
import { mode } from './mode'

// Live updates. Pairing and revoke events travel over Postgres LISTEN/NOTIFY (`relife_events`), so they reach the right
// streams on any web instance. One shared loop per process, active only while someone is connected, polls the data
// version every 3 s for each connected user. GET /api/v1/events turns these into Server-Sent Events.

const CHANNEL = 'relife_events'

/**
 * What travels over NOTIFY. `userId` null = a request nobody has claimed yet: self-host streams all see it, except that with
 * several people on the server only the owner's streams do (a member must not learn that someone else is connecting a device).
 */
export type Notice = { userId: string | null; event: Event; deviceId?: string }

type Sub = { userId: string; deviceId: string; send: (e: Event) => void }
const g = globalThis as unknown as { __relifeHub?: Hub }

class Hub {
  subs = new Set<Sub>()
  versions = new Map<string, string | null>()
  timer: ReturnType<typeof setInterval> | undefined
  listening: Promise<unknown> | undefined

  listen() {
    this.listening ??= pg.listen(CHANNEL, (payload) => {
      try { void this.deliver(JSON.parse(payload) as Notice).catch(() => {}) } catch { /* ignore a malformed notice */ }
    }).catch((e) => { this.listening = undefined; console.error('[events] listen failed', e instanceof Error ? e.message : e) })
    return this.listening
  }

  async deliver(n: Notice) {
    if (n.event.type === 'device.revoked') forgetDevice(n.event.id)
    const only = n.userId === null && (await hasMembers()) ? await ownerId() : null
    for (const s of this.subs) {
      if (n.userId === null ? mode() !== 'cloud' && (!only || s.userId === only) : s.userId === n.userId) s.send(n.event)
    }
  }

  async tick() {
    for (const userId of new Set([...this.subs].map((s) => s.userId))) {
      try {
        const v = await dataVersionFor(userId)
        if (this.versions.has(userId) && this.versions.get(userId) !== v) {
          for (const s of this.subs) if (s.userId === userId) s.send({ type: 'data', version: v ?? '' })
        }
        this.versions.set(userId, v)
      } catch { /* the database blinked: next tick */ }
    }
  }

  async add(sub: Sub) {
    await this.listen()
    this.subs.add(sub)
    this.timer ??= setInterval(() => void this.tick(), 3000)
    return () => {
      this.subs.delete(sub)
      if (!this.subs.size) { clearInterval(this.timer); this.timer = undefined; this.versions.clear() }
    }
  }
}

const hub = () => (g.__relifeHub ??= new Hub())

/** Start sending `send` the events of one user, until the returned function is called. */
export const subscribe = (sub: Sub) => hub().add(sub)

/** Tell every web instance (including this one, through LISTEN). */
export async function publish(n: Notice) {
  await pg.notify(CHANNEL, JSON.stringify(n)).catch((e) => console.error('[events] notify failed', e instanceof Error ? e.message : e))
}
