import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Lazy so `next build` and tests that never touch the DB don't need SITE_DATABASE_URL.
let _db: ReturnType<typeof create> | undefined
function create() {
  const url = process.env.SITE_DATABASE_URL
  if (!url) throw new Error('SITE_DATABASE_URL is not set (the waitlist has its own database, see apps/site/env.example)')
  return drizzle(postgres(url, { max: 5 }), { schema })
}
export const db = () => (_db ??= create())
