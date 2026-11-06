// Optional demo data so the dashboard has something to show: `npm run seed:demo`.
// Safe to re-run; it skips schedules that already exist by name.
import { and, eq } from 'drizzle-orm'
import { db, schema, sql } from '@/db'
import { getUser } from '@/core/user'
import { buildRRule } from '@/domain/recurrence'
import { localDate } from '@/core/time'
import { persist } from '@/core/ingest'

async function main() {
  const user = await getUser()
  const today = localDate(new Date(), user.timezone)
  const day1 = `${today.slice(0, 8)}01`
  const add = async (v: Omit<typeof schema.schedules.$inferInsert, 'userId'>) => {
    const [exists] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.userId, user.id), eq(schema.schedules.name, v.name)))
    if (!exists) await db.insert(schema.schedules).values({ ...v, userId: user.id })
  }
  await add({ name: 'Drink water', kind: 'routine', category: 'health', target: 3000, unit: 'ml', rrule: buildRRule({ freq: 'daily', times: ['10:00', '13:00', '16:00', '19:00'], start: today }), meta: { trackerSlug: 'drink-water', step: 250 } })
  await add({ name: 'Morning skincare', kind: 'routine', category: 'health', rrule: buildRRule({ freq: 'daily', times: ['08:00'], start: today }), meta: { notes: 'Cleanser · serum · sunscreen' } })
  await add({ name: 'Night skincare', kind: 'routine', category: 'health', rrule: buildRRule({ freq: 'daily', times: ['22:30'], start: today }), meta: {} })
  await add({ name: 'Face mask', kind: 'routine', category: 'health', rrule: buildRRule({ freq: 'weekly', times: ['21:00'], byweekday: ['SU'], start: today }), meta: {} })
  await add({ name: 'Vitamin D3', kind: 'medicine', category: 'health', rrule: buildRRule({ freq: 'daily', times: ['09:00'], start: today }), meta: { dose: '1 capsule', stock: 12, doseCount: 1 } })
  await add({ name: 'Journal', kind: 'routine', category: 'mind', rrule: buildRRule({ freq: 'daily', times: ['22:00'], start: today }), meta: {} })
  await add({ name: 'Practice DSA', kind: 'routine', category: 'skills', rrule: buildRRule({ freq: 'daily', times: ['19:00'], start: today }), meta: { notes: '1 problem' } })
  await add({ name: 'Call parents', kind: 'routine', category: 'relationships', rrule: buildRRule({ freq: 'weekly', times: ['18:00'], byweekday: ['SU', 'WE'], start: today }), meta: {} })
  await add({ name: 'Claude Pro', kind: 'subscription', category: 'wealth', amount: 20, currency: 'USD', rrule: buildRRule({ freq: 'monthly', times: ['09:00'], bymonthday: 12, start: day1 }), remindOffsetMin: 3 * 1440, meta: {} })
  await add({ name: 'Netflix', kind: 'subscription', category: 'wealth', amount: 649, currency: 'INR', rrule: buildRRule({ freq: 'monthly', times: ['09:00'], bymonthday: 9, start: day1 }), remindOffsetMin: 3 * 1440, meta: {} })
  await add({ name: 'boot.dev', kind: 'subscription', category: 'skills', amount: 348, currency: 'USD', rrule: buildRRule({ freq: 'yearly', times: ['09:00'], bymonthday: 3, bymonth: 2, start: day1 }), remindOffsetMin: 7 * 1440, meta: {} })
  await add({ name: 'Axis credit card bill', kind: 'bill', category: 'wealth', rrule: buildRRule({ freq: 'monthly', times: ['10:00'], bymonthday: 18, start: day1 }), remindOffsetMin: 3 * 1440, meta: {} })
  for (let i = 0; i < 14; i++) {
    const d = new Date(Date.now() - i * 86_400_000)
    const date = localDate(d, user.timezone)
    await persist(user, { kind: 'entry', tracker: 'sleep.hours', date, value: 6 + ((i * 7) % 5) * 0.5, source: 'demo', defaults: { name: 'Sleep', category: 'health', unit: 'h', aggregate: 'last', target: 7.5 } })
    await persist(user, { kind: 'entry', tracker: 'steps', date, value: 4000 + ((i * 3373) % 7000), source: 'demo', defaults: { name: 'Steps', category: 'health', target: 8000 } })
    await persist(user, { kind: 'entry', tracker: 'github.commits', date, value: (i * 5) % 9, source: 'demo', defaults: { name: 'Commits', category: 'skills' } })
    await persist(user, { kind: 'entry', tracker: 'mood', date, value: 2 + (i % 4), source: 'demo', defaults: { name: 'Mood', category: 'mind', kind: 'scale', aggregate: 'last', target: 5 } })
    const merchants = [['zomato@hdfcbank', 'ZOMATO', 389], ['blinkit.payu@axisbank', 'BLINKIT', 612], ['zeptonow@ybl', 'ZEPTO', 245], ['uber@axisbank', 'UBER', 180]] as const
    const [upi, m, amt] = merchants[i % merchants.length]
    await persist(user, { kind: 'transaction', account: { key: 'axis:4821', kind: 'bank', name: 'Axis Savings ••4821', institution: 'Axis Bank' }, at: d, amount: -(amt + i * 11), currency: 'INR', merchant: m, upiId: upi, balance: 84210 - i * 900, source: 'demo', externalRef: `demo-${i}` })
  }
  console.log('Demo data ready.')
  await sql.end()
}
main()
