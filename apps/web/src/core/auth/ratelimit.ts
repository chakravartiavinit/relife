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

/**
 * Count one try and say whether it is over `limit`, in one statement: two parallel requests cannot both read "under the
 * limit" and then both count (which check-then-count allowed). `wait` is the seconds left in the window; 0 while the try is allowed.
 * A new window starts when the old one has run out. Callers clear the key on success (clearFailures).
 */
export async function hit(key: string, limit: number, windowMs: number) {
  const [r] = await db.execute<{ count: number; wait: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start > now() - ${windowMs} * interval '1 millisecond' then rate_limits.count + 1 else 1 end,
      window_start = case when rate_limits.window_start > now() - ${windowMs} * interval '1 millisecond' then rate_limits.window_start else now() end
    returning count, ceil(extract(epoch from (window_start + ${windowMs} * interval '1 millisecond' - now())))::int as wait`)
  return { count: r.count, wait: r.count > limit ? Math.max(1, r.wait) : 0 }
}

export async function clearFailures(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`)
}
