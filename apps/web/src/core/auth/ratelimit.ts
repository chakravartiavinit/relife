import { sql } from 'drizzle-orm'
import { db } from '@/db'

// Fixed-window counters in the database (table rate_limits), so a limit holds across web instances.

/** Seconds left in the block, or 0 when `key` may go on. Does not count. */
export async function blockedFor(key: string, limit: number, windowMs: number) {
  const [r] = await db.execute<{ wait: number | null }>(sql`
    select ceil(extract(epoch from (window_start + ${windowMs} * interval '1 millisecond' - now())))::int as wait
    from rate_limits where key = ${key} and count >= ${limit} and window_start > now() - ${windowMs} * interval '1 millisecond'`)
  return r?.wait && r.wait > 0 ? r.wait : 0
}

/** Count one failure. A new window starts when the old one has run out. One upsert. */
export async function countFailure(key: string, windowMs: number) {
  await db.execute(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start > now() - ${windowMs} * interval '1 millisecond' then rate_limits.count + 1 else 1 end,
      window_start = case when rate_limits.window_start > now() - ${windowMs} * interval '1 millisecond' then rate_limits.window_start else now() end`)
}

export async function clearFailures(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`)
}
