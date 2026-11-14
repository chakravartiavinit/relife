import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { assertDemoSafe, isDemo } from '../core/demo'

const base = process.env.DATABASE_URL
if (!base) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.')

/** Mock mode (`npm run dev:mock`) reads and writes `<db>_mock`, never your real database. */
export const isMock = process.env.RELIFE_MOCK === '1'
export const databaseUrl = isMock ? Object.assign(new URL(base), { pathname: `${new URL(base).pathname}_mock` }).toString() : base
const url = databaseUrl

// The read-only demo only ever opens the mock database, and its session is read-only: a write that slips past the gate
// (src/core/auth/gate.ts) fails inside Postgres.
assertDemoSafe()

// Reuse one pool across Next.js hot reloads.
const g = globalThis as unknown as { __relifeSql?: postgres.Sql }
export const sql = g.__relifeSql ?? postgres(url, { max: 10, ...(isDemo() ? { connection: { default_transaction_read_only: true } } : {}) })
if (process.env.NODE_ENV !== 'production') g.__relifeSql = sql

export const db = drizzle(sql, { schema })
export type Db = typeof db
export { schema }
