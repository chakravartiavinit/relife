import type { Device } from './auth/devices'

// RELIFE_DEMO=1: a strict read-only copy of the app on mock data, for a public demo (docs/SELF_HOSTING.md). Pure rules with
// an `env` parameter like auth/mode.ts, so db/index.ts can call them at import without a database.
// Three layers keep it read-only: the edge gate refuses every non-GET request (auth/gate.ts), the database session is
// read-only (db/index.ts), and the worker, the AI and the connectors are off.

type Env = Record<string, string | undefined>

export const DEMO_MESSAGE = 'Demo: changes are off'
export const DEMO_HEADER = 'X-ReLife-Demo'

export const isDemo = (env: Env = process.env) => env.RELIFE_DEMO === '1'

/** The demo runs on the mock database only: it can never open a real one. */
export function assertDemoSafe(env: Env = process.env) {
  if (isDemo(env) && env.RELIFE_MOCK !== '1') throw new Error('RELIFE_DEMO needs RELIFE_MOCK=1: the demo runs on the mock database only')
}

/** Methods a demo visitor may use. Everything else, and every server action, is refused. */
export const demoMethodAllowed = (method: string) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

/** The signed-in browser every demo visitor is: no cookie, no pairing. Reads only (GET and HEAD). */
export function demoDevice(userId: string): Device {
  return {
    id: '00000000-0000-0000-0000-00000000de30', userId, kind: 'browser', name: 'Demo visitor', scopes: ['full'], tokenHash: Buffer.alloc(0),
    via: null, meta: {}, createdAt: new Date(0), lastSeenAt: new Date(0), expiresAt: new Date('2999-01-01T00:00:00Z'), revokedAt: null,
  } as Device
}

export type SeedCounts = { schedules: number; entries: number; transactions: number }

/**
 * `seed-demo.ts` writes sample rows into whatever database it is pointed at. It refuses when that database already holds
 * the person's own data (rows not from `source = 'demo'`), unless forced, and always refuses inside the demo itself.
 */
export function seedDemoAllowed(o: { dbName: string; counts: SeedCounts; force?: boolean; env?: Env }): { ok: true } | { ok: false; reason: string } {
  if (isDemo(o.env)) return { ok: false, reason: 'seed-demo does not run inside the read-only demo.' }
  const { schedules, entries, transactions } = o.counts
  if (schedules + entries + transactions > 0 && !o.force) {
    return { ok: false, reason: `Database "${o.dbName}" already holds your data (${schedules} schedules, ${entries} entries, ${transactions} transactions). Run with --force to add the sample data anyway.` }
  }
  return { ok: true }
}
