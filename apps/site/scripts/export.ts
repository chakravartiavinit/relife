// CSV of confirmed signups only: npm run waitlist:export -w apps/site > waitlist.csv
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { waitlistSignups as t } from '@/db/schema'
import { positionOf } from '@/lib/position'

const csv = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(' ') : String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const rows = await db().select().from(t).where(eq(t.status, 'confirmed'))
  const ranked = rows.map((r) => ({ ...r, position: positionOf(r, rows) })).sort((a, b) => a.position - b.position)
  console.log('email,position,referrals,interests,platforms,source,created_at,confirmed_at')
  for (const r of ranked) console.log([r.email, r.position, r.referralCount, r.interests, r.platforms, r.source, r.createdAt, r.confirmedAt].map(csv).join(','))
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
