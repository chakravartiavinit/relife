import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Lazy so `next build` and tests that never touch the DB don't need SITE_DATABASE_URL.
let _db: ReturnType<typeof create> | undefined
function create() {
  const url = process.env.SITE_DATABASE_URL
  if (!url) throw new Error('SITE_DATABASE_URL is not set (the waitlist has its own database, see apps/site/env.example)')
  // One connection per serverless instance: many instances each holding a pool run the database out of
  // connections. Point SITE_DATABASE_URL at a pooler (e.g. PgBouncer / Supabase / Neon pooled URL) in production;
  // `prepare: false` keeps it working when that pooler runs in transaction mode.
  return drizzle(postgres(url, { max: 1, prepare: false, idle_timeout: 20 }), { schema })
}
export const db = () => (_db ??= create())
