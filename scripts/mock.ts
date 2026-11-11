// Mock mode: fills a separate database (`relife_mock`) with ~4 months of random but plausible data,
// so every page has something to show. Your real database is never touched.
//
//   npm run dev:mock              reseed and start the app on http://127.0.0.1:3001 (stop npm run dev first)
//   npm run mock:seed -- 42       reseed only, with a fixed seed for repeatable data
//
// Mock mode runs the web app only (no worker), so nothing is sent to Telegram.
import { execSync } from 'node:child_process'
import postgres from 'postgres'

const DAYS = 120

// Small seeded PRNG so a given seed always produces the same data.
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    chance: (p: number) => next() < p,
    between: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)],
    normal: (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  }
}

async function main() {
  const realUrl = process.env.DATABASE_URL
  if (!realUrl) throw new Error('DATABASE_URL is not set')
  process.env.RELIFE_MOCK = '1'
  const { db, schema, sql, databaseUrl: url } = await import('@/db')
  const dbName = new URL(url).pathname.slice(1)
  if (!dbName.endsWith('_mock')) throw new Error(`Refusing to seed "${dbName}": mock database names must end in _mock`)
  const seed = Number(process.argv[2]) || Math.floor(Math.random() * 1e9)

  // Create the mock database and push the schema. The pool from '@/db' only connects on first query.
  const admin = postgres(realUrl, { max: 1, onnotice: () => {} })
  const [exists] = await admin`select 1 from pg_database where datname = ${dbName}`
  if (!exists) await admin.unsafe(`create database "${dbName}"`)
  await admin.end()
  execSync('npx drizzle-kit push --force', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })

  const { localDate, localDayRange, addDays, wallToUtc } = await import('@/core/time')
  const { buildRRule, occurrencesBetween } = await import('@/domain/recurrence')

  const [{ current }] = await sql`select current_database() as current`
  if (!String(current).endsWith('_mock')) throw new Error(`Connected to "${current}", not a mock database`)
  const tables = await sql`select tablename from pg_tables where schemaname = 'public'`
  await sql.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} cascade`)

  const r = rng(seed)
  const now = new Date()
  const tz = process.env.RELIFE_TIMEZONE || 'Asia/Kolkata'
  const today = localDate(now, tz)
  const start = addDays(today, -(DAYS - 1))
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const at = (d: string, hh: number, mm = 0) => {
    const t = wallToUtc(new Date(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`), tz)
    return t > now ? new Date(now.getTime() - 60_000) : t
  }

  // Fixed id: a running mock server caches the user, so reseeding live keeps working.
  const [user] = await db.insert(schema.users).values({
    id: '00000000-0000-4000-8000-00000000a1e5',
    name: process.env.RELIFE_USER_NAME || 'Alex',
    timezone: tz,
    baseCurrency: process.env.RELIFE_BASE_CURRENCY || 'INR',
    profile: {
      goals: 'Sleep 7.5h, ship code every weekday, spend less on food delivery, call family twice a week.',
      constraints: 'Office days Tue–Thu.',
      areas: ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'],
      focus: 'health',
      tone: 'balanced',
      // Not onboarded: mock opens on /welcome so setup (and its fresh start at Level 1) can be tried.
    },
    createdAt: wallToUtc(new Date(`${start}T09:00:00Z`), tz),
  }).returning()
  const uid = user.id

  // 3. Trackers and daily entries.
  type T = typeof schema.trackers.$inferInsert
  const trackerDefs: Omit<T, 'userId'>[] = [
    { slug: 'sleep.hours', name: 'Sleep', category: 'health', unit: 'h', target: 7.5, aggregate: 'last' },
    { slug: 'steps', name: 'Steps', category: 'health', target: 8000 },
    { slug: 'weight', name: 'Weight', category: 'health', unit: 'kg', target: 72, direction: 'down', aggregate: 'last' },
    { slug: 'drink-water', name: 'Water', category: 'health', unit: 'ml', target: 3000 },
    { slug: 'mood', name: 'Mood', category: 'mind', kind: 'scale', target: 5, aggregate: 'last' },
    { slug: 'energy', name: 'Energy', category: 'mind', kind: 'scale', target: 5, aggregate: 'last' },
    { slug: 'screen-time', name: 'Screen time', category: 'mind', unit: 'h', target: 3, direction: 'down', aggregate: 'last' },
    { slug: 'meditation', name: 'Meditation', category: 'mind', kind: 'duration', unit: 'min', target: 10 },
    { slug: 'github.commits', name: 'Commits', category: 'skills' },
    { slug: 'github.prs', name: 'Pull requests', category: 'skills' },
    { slug: 'github.reviews', name: 'Reviews', category: 'skills' },
    { slug: 'learning.minutes', name: 'Learning', category: 'skills', kind: 'duration', unit: 'min', target: 45 },
    { slug: 'people.contacts', name: 'People contacted', category: 'relationships' },
    { slug: 'guitar', name: 'Guitar', category: 'hobbies', kind: 'duration', unit: 'min', target: 30 },
    { slug: 'drawing', name: 'Drawing', category: 'hobbies', kind: 'duration', unit: 'min', target: 15 },
    { slug: 'chess', name: 'Chess', category: 'hobbies', kind: 'duration', unit: 'min', target: 10 },
    // From the newer connectors (Strava, Todoist, WakaTime, Duolingo, Last.fm), same defaults as src/parsers/daily.ts.
    { slug: 'exercise.minutes', name: 'Active minutes', category: 'health', kind: 'duration', unit: 'min', target: 30 },
    { slug: 'run.km', name: 'Running', category: 'health', unit: 'km' },
    { slug: 'tasks.done', name: 'Tasks done', category: 'mind', target: 5 },
    { slug: 'coding.minutes', name: 'Coding time', category: 'skills', kind: 'duration', unit: 'min', target: 60 },
    { slug: 'duolingo.xp', name: 'Duolingo XP', category: 'skills', target: 30 },
    { slug: 'duolingo.streak', name: 'Duolingo streak', category: 'skills', aggregate: 'last' },
    { slug: 'listening', name: 'Music listening', category: 'hobbies', kind: 'duration', unit: 'min' },
    { slug: 'listening.songs', name: 'Songs played', category: 'hobbies' },
    { slug: 'typing-wpm', name: 'Typing speed', category: 'skills', unit: 'wpm', aggregate: 'last' },
  ]
  const trackers = await db.insert(schema.trackers).values(trackerDefs.map((t) => ({ ...t, userId: uid }))).returning()
  const tid = Object.fromEntries(trackers.map((t) => [t.slug, t.id]))

  const entries: (typeof schema.entries.$inferInsert)[] = []
  const entry = (slug: string, d: string, value: number, source: string, verified = source !== 'manual') =>
    entries.push({ userId: uid, trackerId: tid[slug], localDate: d, value: Math.round(value * 100) / 100, source, verified })
  // A missed week of logging two months in, so the streak has a "best" to beat.
  const lapse = new Set(Array.from({ length: 4 }, (_, i) => addDays(today, -60 + i)))
  let weight = r.between(76, 78)
  days.forEach((d, i) => {
    const wd = weekday(d)
    const weekend = wd === 0 || wd === 6
    const logs = !lapse.has(d)
    if (r.chance(0.9)) entry('sleep.hours', d, Math.min(9.5, Math.max(4.5, r.normal(weekend ? 7.8 : 6.9, 0.7))), 'sleep')
    if (r.chance(0.95)) entry('steps', d, Math.max(800, Math.round(r.normal(weekend ? 9500 : 6500, 2200))), 'apple-health')
    weight += r.normal(-0.025, 0.25)
    if (logs && r.chance(0.55)) entry('weight', d, weight, 'manual')
    if (logs && (d !== today || r.chance(0.6))) entry('drink-water', d, d === today ? 1250 : Math.round(r.between(1500, 3600) / 250) * 250, 'manual')
    if (logs && r.chance(0.88)) entry('mood', d, Math.min(5, Math.max(1, Math.round(r.normal(3.6 + i / DAYS * 0.4, 0.9)))), 'manual')
    if (logs && r.chance(0.7)) entry('energy', d, Math.min(5, Math.max(1, Math.round(r.normal(3.3, 0.9)))), 'manual')
    if (r.chance(0.92)) entry('screen-time', d, Math.max(0.8, r.normal(weekend ? 4.6 : 3.4, 1)), 'apple-health')
    if (logs && r.chance(0.45)) entry('meditation', d, r.pick([5, 10, 10, 15, 20]), 'manual')
    const commits = weekend ? (r.chance(0.35) ? r.int(1, 6) : 0) : r.chance(0.85) ? r.int(1, 14) : 0
    if (logs && (commits || r.chance(0.5))) entry('github.commits', d, commits, 'github')
    if (logs && !weekend && r.chance(0.3)) entry('github.prs', d, r.int(1, 2), 'github')
    if (logs && !weekend && r.chance(0.35)) entry('github.reviews', d, r.int(1, 3), 'github')
    if (logs && r.chance(0.6)) entry('learning.minutes', d, r.pick([15, 30, 30, 45, 60, 90]), 'manual')
    if (logs && r.chance(0.3)) entry('people.contacts', d, r.int(1, 2), 'manual')
    // Hobbies: guitar most evenings, drawing on weekends, chess now and then.
    if (logs && r.chance(weekend ? 0.5 : 0.65)) entry('guitar', d, r.pick([15, 20, 30, 30, 45, 60]), 'manual')
    if (logs && r.chance(weekend ? 0.7 : 0.2)) entry('drawing', d, r.pick([20, 30, 45, 60, 90]), 'manual')
    if (logs && r.chance(0.3)) entry('chess', d, r.pick([10, 15, 20, 30]), 'manual')
  })
  // Connector data on its own generator, so adding it left every number above unchanged for a given seed.
  const c = rng(seed ^ 0x5eed)
  let streak = 0
  days.forEach((d) => {
    const wd = weekday(d)
    const weekend = wd === 0 || wd === 6
    // Strava: runs three mornings a week, a long one on Sunday; a lull two months in.
    const ran = !lapse.has(d) && (wd === 0 ? c.chance(0.8) : [2, 4].includes(wd) ? c.chance(0.7) : c.chance(0.1))
    const km = ran ? Math.round(c.normal(wd === 0 ? 9 : 5, 1.2) * 100) / 100 : 0
    entry('exercise.minutes', d, ran ? Math.round(km * c.between(5.6, 6.6)) : 0, 'strava')
    if (ran) entry('run.km', d, km, 'strava')
    entry('tasks.done', d, Math.max(0, Math.round(c.normal(weekend ? 2 : 6, 2.2))), 'todoist')
    entry('coding.minutes', d, weekend ? (c.chance(0.4) ? c.int(20, 150) : 0) : Math.max(0, Math.round(c.normal(190, 70))), 'wakatime')
    const xp = c.chance(0.85) ? c.pick([10, 15, 20, 30, 40, 60]) : 0
    streak = xp ? streak + 1 : 0
    entry('duolingo.xp', d, xp, 'duolingo')
    entry('duolingo.streak', d, streak, 'duolingo')
    const songs = Math.max(0, Math.round(c.normal(weekend ? 35 : 22, 10)))
    entry('listening', d, Math.round(songs * 3.5), 'lastfm')
    entry('listening.songs', d, songs, 'lastfm')
  })
  // Typing speed for the outcome goal sample, on its own generator so the numbers above stay the same per seed.
  const ty = rng(seed ^ 0x7a9e)
  days.forEach((d, i) => {
    if (ty.chance(0.85)) entry('typing-wpm', d, Math.round(ty.normal(52 + (i / DAYS) * 14, 3)), 'manual')
  })
  for (let i = 0; i < entries.length; i += 500) await db.insert(schema.entries).values(entries.slice(i, i + 500))

  // 4. Routines, medicines, subscriptions and bills, with check history.
  type S = Omit<typeof schema.schedules.$inferInsert, 'userId'>
  const rule = (o: Parameters<typeof buildRRule>[0]) => buildRRule(o)
  const defs: S[] = [
    { name: 'Drink water', kind: 'routine', category: 'health', target: 3000, unit: 'ml', rrule: rule({ freq: 'daily', times: ['10:00', '13:00', '16:00', '19:00'], start }), meta: { trackerSlug: 'drink-water', step: 250 } },
    { name: 'Morning skincare', kind: 'routine', category: 'health', rrule: rule({ freq: 'daily', times: ['08:00'], start }), meta: { notes: 'Cleanser · serum · sunscreen' } },
    { name: 'Night skincare', kind: 'routine', category: 'health', rrule: rule({ freq: 'daily', times: ['22:30'], start }), meta: {} },
    { name: 'Face mask', kind: 'routine', category: 'health', rrule: rule({ freq: 'weekly', times: ['21:00'], byweekday: ['SU'], start }), meta: {} },
    { name: 'Gym', kind: 'routine', category: 'health', rrule: rule({ freq: 'weekly', times: ['07:00'], byweekday: ['MO', 'WE', 'FR'], start }), meta: { notes: 'Push · pull · legs' } },
    { name: 'Vitamin D3', kind: 'medicine', category: 'health', rrule: rule({ freq: 'daily', times: ['09:00'], start }), meta: { dose: '1 capsule', stock: 9, doseCount: 1 } },
    { name: 'Omega-3', kind: 'medicine', category: 'health', rrule: rule({ freq: 'daily', times: ['09:00', '21:00'], start }), meta: { dose: '1 softgel', stock: 46, doseCount: 1 } },
    { name: 'Journal', kind: 'routine', category: 'mind', rrule: rule({ freq: 'daily', times: ['22:00'], start }), meta: { notes: 'Three lines' } },
    { name: 'No phone after 11', kind: 'routine', category: 'mind', rrule: rule({ freq: 'daily', times: ['23:00'], start }), meta: {} },
    { name: 'Practice DSA', kind: 'routine', category: 'skills', rrule: rule({ freq: 'daily', times: ['19:00'], start }), meta: { notes: '1 problem' } },
    { name: 'Read 20 pages', kind: 'routine', category: 'skills', rrule: rule({ freq: 'daily', times: ['21:30'], start }), meta: {} },
    { name: 'Review budget', kind: 'routine', category: 'wealth', rrule: rule({ freq: 'weekly', times: ['10:00'], byweekday: ['SU'], start }), meta: {} },
    { name: 'Call parents', kind: 'routine', category: 'relationships', rrule: rule({ freq: 'weekly', times: ['18:00'], byweekday: ['SU', 'WE'], start }), meta: {} },
    { name: 'Claude Pro', kind: 'subscription', category: 'wealth', amount: 20, currency: 'USD', rrule: rule({ freq: 'monthly', times: ['09:00'], bymonthday: 12, start }), remindOffsetMin: 3 * 1440, meta: { plan: 'Pro' } },
    { name: 'Netflix', kind: 'subscription', category: 'wealth', amount: 649, currency: 'INR', rrule: rule({ freq: 'monthly', times: ['09:00'], bymonthday: 9, start }), remindOffsetMin: 3 * 1440, meta: { plan: 'Standard' } },
    { name: 'Spotify', kind: 'subscription', category: 'wealth', amount: 139, currency: 'INR', rrule: rule({ freq: 'monthly', times: ['09:00'], bymonthday: 21, start }), remindOffsetMin: 2 * 1440, meta: {} },
    { name: 'Amazon Prime', kind: 'subscription', category: 'wealth', amount: 1499, currency: 'INR', rrule: rule({ freq: 'yearly', times: ['09:00'], bymonthday: 14, bymonth: Number(today.slice(5, 7)), start }), remindOffsetMin: 7 * 1440, meta: {} },
    { name: 'GitHub Copilot', kind: 'subscription', category: 'skills', amount: 10, currency: 'USD', rrule: rule({ freq: 'monthly', times: ['09:00'], bymonthday: 2, start }), remindOffsetMin: 3 * 1440, meta: {} },
    { name: 'boot.dev', kind: 'subscription', category: 'skills', amount: 348, currency: 'USD', rrule: rule({ freq: 'yearly', times: ['09:00'], bymonthday: 3, bymonth: 2, start }), remindOffsetMin: 7 * 1440, meta: {} },
    { name: 'Axis credit card bill', kind: 'bill', category: 'wealth', rrule: rule({ freq: 'monthly', times: ['10:00'], bymonthday: 18, start }), remindOffsetMin: 3 * 1440, meta: {} },
    { name: 'Airtel postpaid', kind: 'bill', category: 'wealth', amount: 599, currency: 'INR', rrule: rule({ freq: 'monthly', times: ['10:00'], bymonthday: 5, start }), remindOffsetMin: 2 * 1440, meta: {} },
    { name: 'Car insurance', kind: 'renewal', category: 'wealth', amount: 14200, currency: 'INR', rrule: rule({ freq: 'yearly', times: ['10:00'], bymonthday: 28, bymonth: (Number(today.slice(5, 7)) % 12) + 1, start }), remindOffsetMin: 14 * 1440, meta: {} },
  ]
  const created = wallToUtc(new Date(`${addDays(start, -1)}T09:00:00Z`), tz)
  const schedules = await db.insert(schema.schedules).values(defs.map((s) => ({ ...s, userId: uid, createdAt: created }))).returning()
  const checks: (typeof schema.checks.$inferInsert)[] = []
  const [from] = localDayRange(start, tz)
  for (const s of schedules) {
    if (s.kind !== 'routine' && s.kind !== 'medicine') continue
    if ((s.meta as { trackerSlug?: string }).trackerSlug) continue // quantity goals are done by the tracker value
    const discipline = s.kind === 'medicine' ? 0.88 : r.between(0.6, 0.9)
    for (const occ of occurrencesBetween(s.rrule, from, now, tz)) {
      const d = localDate(occ, tz)
      if (lapse.has(d)) continue
      const roll = r.next()
      if (roll < discipline) checks.push({ scheduleId: s.id, occurrence: occ, localDate: d, status: 'done', at: new Date(occ.getTime() + r.int(0, 50) * 60_000) })
      else if (roll < discipline + 0.05) checks.push({ scheduleId: s.id, occurrence: occ, localDate: d, status: 'skipped', at: occ })
    }
  }
  for (let i = 0; i < checks.length; i += 500) await db.insert(schema.checks).values(checks.slice(i, i + 500))

  // 5. Money: accounts, transactions, crypto.
  const accounts = await db.insert(schema.accounts).values([
    { userId: uid, key: 'axis:4821', kind: 'bank', name: 'Axis Savings ••4821', institution: 'Axis Bank', currency: 'INR', latestBalance: Math.round(r.between(140_000, 220_000)), balanceAt: new Date(now.getTime() - 3 * 3600_000) },
    { userId: uid, key: 'hdfc:7710', kind: 'bank', name: 'HDFC Salary ••7710', institution: 'HDFC Bank', currency: 'INR', latestBalance: Math.round(r.between(30_000, 60_000)), balanceAt: new Date(now.getTime() - 4 * 86_400_000) },
    { userId: uid, key: 'axis-card:1122', kind: 'card', name: 'Axis Ace Card ••1122', institution: 'Axis Bank', currency: 'INR', latestBalance: Math.round(r.between(12_000, 35_000)), balanceAt: new Date(now.getTime() - 86_400_000) },
    { userId: uid, key: 'binance', kind: 'exchange', name: 'Binance', institution: 'Binance', currency: 'USD', balanceAt: now },
    { userId: uid, key: 'zerodha', kind: 'broker', name: 'Zerodha', institution: 'Zerodha', currency: 'INR', latestBalance: Math.round(r.between(250_000, 420_000)), balanceAt: new Date(now.getTime() - 86_400_000) },
  ]).returning()
  const acct = Object.fromEntries(accounts.map((a) => [a.key, a.id]))

  const merchants = [
    ['Zomato', 'zomato@hdfcbank', 'Food delivery', 180, 750],
    ['Swiggy', 'swiggy@icici', 'Food delivery', 150, 650],
    ['Blinkit', 'blinkit.payu@axisbank', 'Groceries', 120, 1400],
    ['Zepto', 'zeptonow@ybl', 'Groceries', 90, 900],
    ['Swiggy Instamart', 'instamart@icici', 'Groceries', 150, 1100],
    ['Uber', 'uber@axisbank', 'Transport', 120, 520],
    ['Rapido', 'rapido@ybl', 'Transport', 40, 180],
    ['Amazon', 'amazon@apl', 'Shopping', 300, 4500],
    ['Myntra', 'myntra@icici', 'Shopping', 600, 3200],
    ['Third Wave Coffee', 'thirdwave@okaxis', 'Eating out', 220, 480],
    ['Social', 'social@hdfcbank', 'Eating out', 900, 3200],
    ['Tata 1mg', '1mg@axisbank', 'Health', 200, 1200],
    ['PVR', 'pvr@icici', 'Entertainment', 350, 900],
  ] as const
  const txns: (typeof schema.transactions.$inferInsert)[] = []
  let ref = 0
  const tx = (d: string, hh: number, amount: number, merchant: string, category: string, extra: Partial<typeof schema.transactions.$inferInsert> = {}) =>
    txns.push({ userId: uid, accountId: acct['axis:4821'], at: at(d, hh, r.int(0, 59)), localDate: d, amount, currency: 'INR', merchant, category, source: 'mock', externalRef: `mock-${ref++}`, ...extra })
  for (const d of days) {
    const dom = Number(d.slice(8))
    const n = r.int(0, weekday(d) === 0 || weekday(d) === 6 ? 5 : 3)
    for (let k = 0; k < n; k++) {
      const [m, upi, cat, lo, hi] = r.pick(merchants)
      tx(d, r.int(8, 23), -Math.round(r.between(lo, hi)), m, cat, { upiId: upi, accountId: r.chance(0.3) ? acct['axis-card:1122'] : acct['axis:4821'] })
    }
    if (dom === 1) tx(d, 10, Math.round(r.between(145_000, 150_000)), 'Acme Corp', 'Income', { accountId: acct['hdfc:7710'] })
    if (dom === 2) tx(d, 11, -60_000, 'Self transfer', 'Transfers', { accountId: acct['hdfc:7710'] })
    if (dom === 2) tx(d, 11, 60_000, 'Self transfer', 'Transfers')
    if (dom === 3) tx(d, 9, -28_000, 'Rent', 'Rent')
    if (dom === 5) tx(d, 10, -599, 'Airtel', 'Bills', { upiId: 'airtel@ybl' })
    if (dom === 9) tx(d, 9, -649, 'Netflix', 'Subscriptions', { accountId: acct['axis-card:1122'] })
    if (dom === 12) tx(d, 9, -20, 'Claude', 'Subscriptions', { currency: 'USD', accountId: acct['axis-card:1122'] })
    if (dom === 15) tx(d, 12, -15_000, 'Binance', 'Investments', { upiId: 'binance@ybl' })
    if (dom === 21) tx(d, 9, -139, 'Spotify', 'Subscriptions', { accountId: acct['axis-card:1122'] })
    if (dom === 25) tx(d, 12, -10_000, 'Zerodha', 'Investments')
  }
  await db.insert(schema.transactions).values(txns)

  const prices = { BTC: r.between(95_000, 112_000), ETH: r.between(3300, 4200), SOL: r.between(150, 220), USDT: 1 }
  await db.insert(schema.holdings).values([
    { userId: uid, accountId: acct.binance, asset: 'BTC', qty: 0.0421, priceUsd: prices.BTC, at: now },
    { userId: uid, accountId: acct.binance, asset: 'ETH', qty: 0.86, priceUsd: prices.ETH, at: now },
    { userId: uid, accountId: acct.binance, asset: 'SOL', qty: 12.4, priceUsd: prices.SOL, at: now },
    { userId: uid, accountId: acct.binance, asset: 'USDT', qty: 312.5, priceUsd: 1, at: now },
  ])
  const trades: (typeof schema.trades.$inferInsert)[] = []
  for (let i = 0; i < 36; i++) {
    const asset = r.pick(['BTC', 'ETH', 'SOL'] as const)
    const d = days[Math.floor((i / 36) * (DAYS - 2))]
    const sell = i > 8 && r.chance(0.25)
    const usd = r.between(80, 400)
    const price = prices[asset] * r.between(0.82, 1.08)
    trades.push({
      userId: uid, accountId: acct.binance, at: at(d, r.int(9, 23)), symbol: `${asset}/USDT`, side: sell ? 'sell' : 'buy',
      qty: Number(((sell ? usd / 2 : usd) / price).toFixed(6)), price, fee: usd * 0.001, feeAsset: 'USDT', kind: 'spot', source: 'mock', externalRef: `mock-trade-${i}`,
    })
  }
  await db.insert(schema.trades).values(trades)

  const fx: (typeof schema.fxRates.$inferInsert)[] = []
  let inr = 87.2
  for (const d of days) {
    inr += r.normal(0.01, 0.12)
    fx.push({ date: d, quote: 'INR', rate: Number(inr.toFixed(4)) }, { date: d, quote: 'EUR', rate: 0.86 }, { date: d, quote: 'GBP', rate: 0.75 })
  }
  await db.insert(schema.fxRates).values(fx)

  // 6. Learning, people, insights, inbox, system state.
  await db.insert(schema.learningItems).values([
    { userId: uid, title: '100xDevs Cohort 3', provider: 'Harkirat Singh', url: 'https://100xdevs.com', cost: 5999, currency: 'INR', status: 'active', progressDone: 34, progressTotal: 120, minutesLogged: 2140, targetDate: addDays(today, 75) },
    { userId: uid, title: 'Backend path', provider: 'boot.dev', url: 'https://boot.dev', cost: 348, currency: 'USD', status: 'active', progressDone: 18, progressTotal: 42, minutesLogged: 1310 },
    { userId: uid, title: 'Designing Data-Intensive Applications', provider: 'Book', status: 'active', progressDone: 6, progressTotal: 12, minutesLogged: 640 },
    { userId: uid, title: 'Rust for TypeScript devs', provider: 'Frontend Masters', status: 'planned', progressDone: 0, progressTotal: 9 },
    { userId: uid, title: 'Systems design primer', provider: 'GitHub', status: 'done', progressDone: 20, progressTotal: 20, minutesLogged: 900 },
    { userId: uid, title: 'Spanish', provider: 'Duolingo', status: 'paused', progressDone: 41, minutesLogged: 380 },
  ])

  const ago = (n: number) => new Date(now.getTime() - n * 86_400_000 - r.int(0, 600) * 60_000)
  await db.insert(schema.people).values([
    { userId: uid, name: 'Mom', relation: 'Family', contactEveryDays: 3, lastContactedAt: ago(1) },
    { userId: uid, name: 'Dad', relation: 'Family', contactEveryDays: 4, lastContactedAt: ago(6) },
    { userId: uid, name: 'Priya', relation: 'Sister', contactEveryDays: 7, lastContactedAt: ago(4) },
    { userId: uid, name: 'Rohan', relation: 'Friend', contactEveryDays: 14, lastContactedAt: ago(23) },
    { userId: uid, name: 'Meera', relation: 'Friend', contactEveryDays: 21, lastContactedAt: ago(9) },
    { userId: uid, name: 'Arjun', relation: 'Mentor', contactEveryDays: 30, lastContactedAt: ago(41) },
    { userId: uid, name: 'Kabir', relation: 'College friend', contactEveryDays: 60, lastContactedAt: null },
  ])

  await db.insert(schema.insights).values([
    { userId: uid, kind: 'nudge', title: 'Food delivery is up 32% this month', body: 'Most orders land between 9 and 11pm. Try a 9pm cut-off on Zomato and Swiggy for two weeks.', status: 'pending' },
    { userId: uid, kind: 'plan', title: 'Add a wind-down routine at 10:30pm', body: 'You sleep 50 minutes more on nights you journal. A fixed wind-down could make that the default.', status: 'pending', payload: { actions: [{ type: 'schedule', name: 'Wind down', kind: 'routine', category: 'health', rrule: buildRRule({ freq: 'daily', times: ['22:30'], start: today }) }] } },
    { userId: uid, kind: 'alert', title: 'Vitamin D3 runs out in 9 days', body: 'Reorder before the 15th to avoid a gap.', status: 'pending' },
    { userId: uid, kind: 'review', title: 'Weekly review', body: 'Commits up, sleep steady, two calls to family. Rohan is overdue.', status: 'accepted', createdAt: ago(7) },
  ])

  await db.insert(schema.rawEvents).values([
    { userId: uid, source: 'sms', externalId: 'mock-sms-1', at: ago(0), status: 'failed', error: 'No parser matched', body: { text: 'INR 1,240.00 debited from A/c XX4821 via UPI to MERCHANT XYZ Ref 4012. Not you? Call 18604195555' } },
    { userId: uid, source: 'sms', externalId: 'mock-sms-2', at: ago(1), status: 'failed', error: 'LLM fallback disabled', body: { text: 'Your a/c no. XXXXX7710 is credited by Rs.3,500.00 on 02-11 by a/c linked to mobile 9XXXXX1234' } },
    { userId: uid, source: 'sms', externalId: 'mock-sms-3', at: ago(2), status: 'ignored', body: { text: 'Your OTP for login is 482910. Do not share it with anyone.' } },
    { userId: uid, source: 'sms', externalId: 'mock-sms-4', at: ago(3), status: 'ignored', body: { text: 'Flat 50% off on your next order! Use code SAVE50.' } },
    ...Array.from({ length: 24 }, (_, i) => ({ userId: uid, source: r.pick(['sms', 'shortcuts', 'sleep', 'github']), externalId: `mock-ok-${i}`, at: ago(i), status: 'parsed' as const, parserId: 'mock', body: {} })),
  ])

  await db.insert(schema.connections).values([
    { userId: uid, connectorId: 'github', status: 'ok', lastSyncAt: ago(0) },
    { userId: uid, connectorId: 'binance', status: 'ok', lastSyncAt: ago(0) },
    { userId: uid, connectorId: 'icloud-inbox', status: 'ok', lastSyncAt: ago(0) },
    { userId: uid, connectorId: 'fx', status: 'ok', lastSyncAt: ago(0) },
    // Fixed times, not ago(): it draws from r, which would shift every number after it.
    ...['strava', 'todoist', 'wakatime', 'duolingo', 'lastfm'].map((connectorId, i) => ({ userId: uid, connectorId, status: 'ok' as const, lastSyncAt: new Date(now.getTime() - (i + 1) * 7 * 60_000) })),
    { userId: uid, connectorId: 'gmail', status: 'error', failures: 3, lastError: 'invalid_grant: token expired', lastSyncAt: ago(2) },
  ])
  await db.insert(schema.syncRuns).values(Array.from({ length: 10 }, (_, i) => {
    const id = r.pick(['github', 'binance', 'icloud-inbox', 'gmail', 'fx'])
    const startedAt = new Date(now.getTime() - (i * 37 + r.int(1, 30)) * 60_000)
    return { connectorId: id, startedAt, finishedAt: new Date(startedAt.getTime() + r.int(400, 9000)), ok: id !== 'gmail', error: id === 'gmail' ? 'invalid_grant: token expired' : null, eventsCount: id === 'gmail' ? 0 : r.int(0, 14) }
  }))
  await db.insert(schema.heartbeats).values({ name: 'worker', at: now })
  await db.insert(schema.llmRuns).values(Array.from({ length: 18 }, (_, i) => ({
    task: r.pick(['parse', 'ask', 'weekly-review', 'nudge']), model: 'anthropic:claude-sonnet-5-5', ok: i % 9 !== 0,
    inputTokens: r.int(400, 4000), outputTokens: r.int(60, 900), ms: r.int(700, 6000), createdAt: ago(r.int(0, 6)),
  })))

  // Net worth history: a gentle random walk ending at today's real total.
  const { netWorthNow } = await import('@/core/net-worth')
  const nw = await netWorthNow(user, now)
  let v = nw.total
  const snaps: (typeof schema.netWorthSnapshots.$inferInsert)[] = []
  for (let i = 0; i < DAYS; i++) {
    snaps.push({ userId: uid, localDate: addDays(today, -i), total: Math.round(v), cash: Math.round(nw.cash), crypto: Math.round(nw.crypto) })
    v -= v * (0.0018 + (r.int(-100, 100) / 100) * 0.012)
  }
  await db.insert(schema.netWorthSnapshots).values(snaps)

  // XP and achievements for the whole period, as if the worker had run all along.
  const { backfillXp, totalXp } = await import('@/core/xp')
  await backfillXp(user, now, DAYS)
  const xp = await totalXp(user)

  // Outcome goals (src/core/goals.ts): a tracker goal with a due review and a coach proposal, a check-in goal,
  // and one pending AI draft, so every goal state shows in `npm run dev:mock`.
  const sid = Object.fromEntries(schedules.map((s) => [s.name, s.id]))
  const startedAt = ago(21)
  const goalRows = await db.insert(schema.goals).values([
    {
      userId: uid, title: 'Type 70 words a minute', reason: 'Faster notes in meetings and less time on chat.', area: 'skills', measureKind: 'tracker',
      trackerId: tid['typing-wpm'], measureName: 'Typing speed', unit: 'wpm', direction: 'increase', target: 70,
      baselineValue: 60, baselineDate: addDays(today, -21), baselineHow: 'Average of 17 recorded days', baselineObservations: 17,
      targetDate: addDays(today, 90), cadence: 'weekly', nextReviewOn: today,
      actions: [{ kind: 'schedule', id: sid['Practice DSA'] }, { kind: 'tracker', id: tid['learning.minutes'] }], createdAt: startedAt,
    },
    {
      userId: uid, title: 'Play Blackbird at 90 bpm', reason: 'I want to play it start to finish without stopping.', area: 'hobbies', measureKind: 'check_in',
      measureName: 'Clean tempo', unit: 'bpm', direction: 'increase', target: 90,
      baselineValue: 66, baselineDate: addDays(today, -21), baselineHow: 'Metronome, best of 3 run-throughs',
      targetDate: addDays(today, 120), cadence: 'weekly', nextReviewOn: addDays(today, 7),
      actions: [{ kind: 'tracker', id: tid['guitar'] }], createdAt: startedAt,
    },
  ]).returning()
  await db.insert(schema.goalCheckIns).values([
    { userId: uid, goalId: goalRows[1].id, localDate: addDays(today, -14), value: 70 },
    { userId: uid, goalId: goalRows[1].id, localDate: addDays(today, -4), value: 74, note: 'Bridge still slips' },
  ])
  const { prepareGoalReviews } = await import('@/core/goals')
  const { eq } = await import('drizzle-orm')
  const [due] = await prepareGoalReviews(user, now, goalRows[0].id)
  if (due) {
    await db.update(schema.goalReviews).set({
      aiNote: 'Practice landed on most due days and the typing average is above the baseline.',
      proposal: { field: 'targetDate', value: addDays(today, 120), why: 'A month more keeps the weekly step modest.' },
    }).where(eq(schema.goalReviews.id, due.review.id))
  }
  await db.insert(schema.insights).values({
    userId: uid, kind: 'plan', status: 'pending', title: 'Goal draft: Solve medium DSA problems in 30 minutes', body: 'You said you want to get better at interviews.',
    payload: {
      dedupeKey: `goal-draft:${today}:mock`,
      goalDraft: {
        title: 'Solve medium DSA problems in 30 minutes', reason: 'You said you want to get better at interviews.', area: 'skills', measure: { checkIn: 'Time for one medium problem', unit: 'min', how: 'One timed problem on Sunday' },
        direction: 'decrease', target: 30, targetDate: addDays(today, 60), cadence: 'weekly', actions: [{ kind: 'schedule', id: sid['Practice DSA'] }],
      },
    },
  })

  console.log(`Mock data ready in "${dbName}" (seed ${seed}): ${entries.length} entries, ${checks.length} checks, ${txns.length} transactions, ${xp} XP.`)
  await sql.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
