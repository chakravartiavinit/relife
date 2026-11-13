import { sql } from 'drizzle-orm'
import { db } from '@/db'

/**
 * The latest change anywhere in the data the dashboard shows: syncs (raw events), money, trackers, checks, quests,
 * XP and insights. Open pages and device clients compare it to refresh themselves when something new lands.
 */
export async function dataVersionFor(userId: string) {
  const [r] = await db.execute<{ v: string | null }>(sql`select greatest(
    (select max(updated_at) from raw_events where user_id = ${userId}),
    (select max(updated_at) from transactions where user_id = ${userId}),
    (select max(updated_at) from entries where user_id = ${userId}),
    (select max(updated_at) from trades where user_id = ${userId}),
    (select max(updated_at) from crypto_flows where user_id = ${userId}),
    (select max(updated_at) from accounts where user_id = ${userId}),
    (select max(at) from holdings where user_id = ${userId}),
    (select max(c.at) from checks c join schedules s on s.id = c.schedule_id where s.user_id = ${userId}),
    (select max(updated_at) from schedules where user_id = ${userId}),
    (select max(updated_at) from insights where user_id = ${userId}),
    (select max(created_at) from system_quests where user_id = ${userId}),
    (select max(created_at) from xp_events where user_id = ${userId}),
    (select max(updated_at) from briefs where user_id = ${userId}),
    (select max(created_at) from coach_messages where user_id = ${userId})
  )::text as v`)
  return r?.v ?? null
}
