// End-to-end check of the waitlist against a running dev server with EMAIL_DRIVER=console.
//   NODE_ENV=development npm run dev -w apps/site > /var/tmp/site-dev.log 2>&1 &
//   node --env-file=apps/site/.env.local apps/site/scripts/e2e.mjs /var/tmp/site-dev.log [--shots dir]
// It empties the site database first (SITE_DATABASE_URL), so only point it at a local one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import postgres from 'postgres'

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3040'
const logPath = process.argv[2]
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null
const dbUrl = process.env.SITE_DATABASE_URL
assert(logPath && dbUrl, 'usage: e2e.mjs <dev-server-log> [--shots dir]; SITE_DATABASE_URL must be set')
assert(/localhost|127\.0\.0\.1/.test(dbUrl), 'refusing to empty a non-local database')
const sql = postgres(dbUrl)
const step = (m) => console.log(`✓ ${m}`)

// The console driver prints the link in the server log. Wait for the newest mail to an address.
async function mailLink(to, after = 0) {
  for (let i = 0; i < 50; i++) {
    const chunks = readFileSync(logPath, 'utf8').split('[email:console]').slice(1)
    const mine = chunks.map((c, n) => ({ c, n })).filter(({ c, n }) => n >= after && c.includes(`to=${to} `))
    const last = mine.at(-1)
    const m = last?.c.match(/https?:\/\/[^\s]+\/w\/([A-Za-z0-9_-]+)/)
    if (m) return { token: m[1], url: `${BASE}/w/${m[1]}`, count: chunks.length, subject: last.c.match(/subject="([^"]+)"/)?.[1] }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no email to ${to}`)
}
const mailCount = () => readFileSync(logPath, 'utf8').split('[email:console]').length - 1

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctxFor = (ip, extra = {}) => browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip }, viewport: { width: 1440, height: 900 }, ...extra })
const shot = async (page, name, opts = {}) => { if (shots) await page.screenshot({ path: `${shots}/site-${name}.png`, ...opts }) }

async function join(page, email, { chips = false } = {}) {
  const form = page.locator('form.wl').first()
  await form.getByLabel('Email').fill(email)
  if (chips) {
    await page.waitForTimeout(400)
    await form.getByRole('button', { name: 'Health', exact: true }).click()
    await form.getByRole('button', { name: 'Skills', exact: true }).click()
    await form.getByRole('button', { name: 'Mac', exact: true }).click()
  }
  await form.getByRole('button', { name: 'Join the waitlist' }).click()
}

try {
  await sql`truncate waitlist_signups, waitlist_attempts restart identity cascade`
  // Twelve confirmed people ahead, so a 10-spot jump is visible.
  for (let i = 1; i <= 12; i++) {
    await sql`insert into waitlist_signups (email, status, token_hash, ref_code, consent_version, confirmed_at) values (${`filler${i}@example.org`}, 'confirmed', ${`h${i}`}, ${`FILLER${String(i).padStart(2, '0')}`}, '2026-11', now())`
  }
  step('seeded 12 confirmed rows')

  // --- Form states --------------------------------------------------------------------------------------------
  const ctxA = await ctxFor('10.0.0.1')
  const a = await ctxA.newPage()
  await a.goto(BASE)
  await a.waitForLoadState('networkidle')
  const more = a.locator('.wl-more').first()
  assert.equal(await more.getAttribute('data-open'), 'false', 'chips collapsed before an email is typed')
  await a.locator('form.wl').first().getByLabel('Email').fill('nope')
  await a.locator('form.wl').first().getByRole('button', { name: 'Join the waitlist' }).click()
  await a.getByText('Enter an email like name@example.com').first().waitFor()
  await shot(a, 'form-invalid', { clip: { x: 340, y: 360, width: 760, height: 280 } })
  step('invalid email shows inline message')

  await a.locator('form.wl').first().getByLabel('Email').fill('x@mailinator.com')
  await a.locator('form.wl').first().getByRole('button', { name: 'Join the waitlist' }).click()
  await a.getByText('Please use an email you keep').first().waitFor()
  step('disposable email is refused')

  // Honeypot: looks like success, stores nothing.
  await a.goto(BASE)
  await a.waitForLoadState('networkidle')
  await a.evaluate(() => { document.querySelector('input[name=company]').value = 'ACME' })
  await join(a, 'bot@example.com')
  await a.getByText('Check your inbox to confirm your spot.').first().waitFor()
  assert.equal((await sql`select 1 from waitlist_signups where email = 'bot@example.com'`).length, 0)
  step('honeypot returns the normal state and stores nothing')

  // --- Join A (chips, attribution) ----------------------------------------------------------------------------
  await a.goto(`${BASE}/?utm_source=e2e&utm_campaign=launch`)
  await a.waitForLoadState('networkidle')
  await a.locator('form.wl').first().getByLabel('Email').fill('alice@example.com')
  await a.waitForTimeout(500)
  assert.equal(await more.getAttribute('data-open'), 'true', 'chips reveal after a valid email')
  await shot(a, 'form-chips', { clip: { x: 340, y: 360, width: 760, height: 420 } })
  await join(a, 'alice@example.com', { chips: true })
  await a.getByText('Check your inbox to confirm your spot.').first().waitFor()
  await shot(a, 'form-done', { clip: { x: 340, y: 360, width: 760, height: 280 } })
  const rowA = (await sql`select * from waitlist_signups where email = 'alice@example.com'`)[0]
  assert.equal(rowA.status, 'pending')
  assert.deepEqual(rowA.interests.sort(), ['health', 'skills'])
  assert.deepEqual(rowA.platforms, ['mac'])
  assert.equal(rowA.source, 'e2e')
  assert.equal(rowA.utm.utm_campaign, 'launch')
  step('join stores pending row with chips, source and utm')

  // Duplicate pending: same UI, and a second confirmation (new token) is sent after the 2-minute limit is lifted.
  const first = await mailLink('alice@example.com')
  assert.match(first.subject, /Confirm your spot/)
  await sql`delete from waitlist_attempts where kind = 'send'`
  const before = mailCount()
  await a.goto(BASE)
  await a.waitForLoadState('networkidle')
  await join(a, 'alice@example.com')
  await a.getByText('Check your inbox to confirm your spot.').first().waitFor()
  const second = await mailLink('alice@example.com', before)
  assert.notEqual(second.token, first.token)
  step('duplicate pending shows the same state and sends a fresh confirmation')

  // Per-email limit: an immediate retry sends nothing but looks the same.
  const afterSecond = mailCount()
  await a.goto(BASE)
  await a.waitForLoadState('networkidle')
  await join(a, 'alice@example.com')
  await a.getByText('Check your inbox to confirm your spot.').first().waitFor()
  await new Promise((r) => setTimeout(r, 800))
  assert.equal(mailCount(), afterSecond, 'per-email rate limit: no second mail within 2 minutes')
  step('per-email limit sends nothing and looks the same')

  // The old link no longer works (token rotated).
  const stale = await ctxA.newPage()
  await stale.goto(first.url)
  await stale.getByText("This link isn't valid.").waitFor()
  step('replaced token link is invalid')

  // --- Confirm A via the email link ----------------------------------------------------------------------------
  const page = await ctxA.newPage()
  await page.goto(second.url)
  await page.getByText(/You're #13/).waitFor()
  await shot(page, 'status-desktop', { fullPage: false })
  const refUrl = await page.locator('#ref-url').inputValue()
  const refA = new URL(refUrl).searchParams.get('ref')
  assert.match(refA, /^[A-HJ-NP-Z2-9]{8}$/)
  assert.ok(await page.getByText('Confirmed people ahead of you: 12').isVisible())
  step(`confirmed from the email link: #13, 12 ahead, referral link ?ref=${refA}`)
  const welcome = await mailLink('alice@example.com', afterSecond)
  assert.match(welcome.subject, /on the .* waitlist/)

  // Reloading the status page never changes anything (and a second confirm POST is a no-op).
  await page.reload()
  await page.getByText(/You're #13/).waitFor()
  step('reload is idempotent')

  // Duplicate confirmed: "Here's your spot" mail instead of a confirmation.
  await sql`delete from waitlist_attempts where kind = 'send'`
  await sql`delete from waitlist_attempts where kind = 'submit'`
  const beforeDup = mailCount()
  await a.goto(BASE)
  await a.waitForLoadState('networkidle')
  await join(a, 'alice@example.com')
  await a.getByText('Check your inbox to confirm your spot.').first().waitFor()
  const dup = await mailLink('alice@example.com', beforeDup)
  assert.match(dup.subject, /Here's your spot/)
  step('duplicate confirmed sends the status link, not a confirmation')
  // That rotated Alice's token: use the newest link from here on.
  const aliceUrl = dup.url

  // --- Referral: B joins through A's link, confirms, A moves up 10 -------------------------------------------
  const ctxB = await ctxFor('10.0.0.2')
  const b = await ctxB.newPage()
  await b.goto(`${BASE}/?ref=${refA}`)
  await b.waitForLoadState('networkidle')
  await join(b, 'bob@example.com')
  await b.getByText('Check your inbox to confirm your spot.').first().waitFor()
  const rowB = (await sql`select * from waitlist_signups where email = 'bob@example.com'`)[0]
  assert.equal(rowB.referred_by, rowA.id)
  // Pending referrals don't count.
  const aPending = await ctxA.newPage()
  await aPending.goto(aliceUrl)
  await aPending.getByText(/You're #13/).waitFor()
  const bobLink = await mailLink('bob@example.com')
  const bp = await ctxB.newPage()
  await bp.goto(bobLink.url)
  await bp.getByText(/You're #14/).waitFor()
  step("B joined through A's link and confirmed as #14")
  await aPending.reload()
  await aPending.getByText(/You're #3/).waitFor()
  assert.ok(await aPending.getByText('Friends joined:').locator('b').first().isVisible())
  assert.equal((await sql`select referral_count from waitlist_signups where email = 'alice@example.com'`)[0].referral_count, 1)
  step('A moved up 10 spots (#13 to #3) with 1 friend joined')
  await shot(aPending, 'status-after-referral')

  // Confirming twice credits once.
  await post(BASE, '/api/waitlist/confirm', bobLink.token)
  assert.equal((await sql`select referral_count from waitlist_signups where email = 'alice@example.com'`)[0].referral_count, 1)
  step('second confirm does not credit again')

  // Self-referral: same IP hash as the referrer, same day: no link.
  await sql`delete from waitlist_attempts where kind = 'submit'`
  const ctxSelf = await ctxFor('10.0.0.1')
  const s = await ctxSelf.newPage()
  await s.goto(`${BASE}/?ref=${refA}`)
  await s.waitForLoadState('networkidle')
  await join(s, 'alias@example.com')
  await s.getByText('Check your inbox to confirm your spot.').first().waitFor()
  assert.equal((await sql`select referred_by from waitlist_signups where email = 'alias@example.com'`)[0].referred_by, null)
  step('self-referral from the same IP is ignored')

  // --- Rate limit per IP --------------------------------------------------------------------------------------
  const ctxR = await ctxFor('10.0.0.9')
  const r = await ctxR.newPage()
  await r.goto(BASE)
  await r.waitForLoadState('networkidle')
  for (let i = 0; i < 5; i++) {
    await join(r, `rate${i}@example.com`)
    await r.getByText('Check your inbox to confirm your spot.').first().waitFor()
    await r.getByRole('button', { name: 'Wrong email? Change it' }).first().click()
  }
  await join(r, 'rate6@example.com')
  await r.getByText('Too many tries. Try again in a few minutes.').first().waitFor()
  await shot(r, 'form-rate-limited', { clip: { x: 340, y: 360, width: 760, height: 280 } })
  step('6th submit from one IP within 10 minutes is rate limited')

  // --- No JavaScript: the form still posts and the confirm button works ----------------------------------------
  const ctxN = await ctxFor('10.0.0.5', { javaScriptEnabled: false })
  const n = await ctxN.newPage()
  await n.goto(BASE)
  await n.locator('form.wl').first().locator('input[name=email]').fill('nojs@example.com')
  await n.locator('form.wl').first().getByRole('button', { name: 'Join the waitlist' }).click()
  await n.waitForLoadState('load')
  await n.getByText('Check your inbox to confirm your spot.').first().waitFor({ timeout: 5000 })
  const nojs = await mailLink('nojs@example.com')
  await n.goto(nojs.url)
  await n.getByRole('button', { name: 'Confirm my spot' }).click()
  await n.getByText(/You're #\d+/).waitFor()
  step('works without JavaScript: join, then Confirm my spot')

  // --- Export has only confirmed rows -------------------------------------------------------------------------
  const { execFileSync } = await import('node:child_process')
  const csv = execFileSync('npx', ['--no-install', 'tsx', '--env-file=.env.local', 'scripts/export.ts'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf8' })
  const lines = csv.trim().split('\n')
  assert.equal(lines[0], 'email,position,referrals,interests,platforms,source,created_at,confirmed_at')
  const emails = lines.slice(1).map((l) => l.split(',')[0])
  assert.ok(emails.includes('alice@example.com') && emails.includes('bob@example.com') && emails.includes('nojs@example.com'))
  assert.ok(!emails.includes('alias@example.com') && !emails.some((e) => e.startsWith('rate')), 'pending rows are not exported')
  assert.equal(lines.at(1).split(',')[0], 'filler1@example.org')
  step(`export CSV has ${emails.length} confirmed rows, no pending ones`)

  // --- Leave deletes the row ----------------------------------------------------------------------------------
  const ap = await ctxA.newPage()
  await ap.goto(aliceUrl)
  await ap.getByText(/You're #/).waitFor()
  await ap.getByRole('button', { name: 'Leave the waitlist' }).click()
  await shot(ap, 'status-leave-confirm', { fullPage: false })
  await ap.getByRole('button', { name: 'Yes, leave' }).click()
  await ap.getByRole('heading', { name: "You've left the waitlist." }).waitFor()
  await shot(ap, 'status-left')
  assert.equal((await sql`select 1 from waitlist_signups where email = 'alice@example.com'`).length, 0)
  step('leave deletes the row')
  // Bob keeps his referral credit history intact; his referred_by simply points nowhere.
  assert.equal((await sql`select referred_by from waitlist_signups where email = 'bob@example.com'`)[0].referred_by, null)

  // --- Mobile status page screenshot --------------------------------------------------------------------------
  if (shots) {
    const ctxM = await ctxFor('10.0.0.7', { viewport: { width: 390, height: 844 } })
    const m = await ctxM.newPage()
    await m.goto(bobLink.url)
    await m.getByText(/You're #/).waitFor()
    await shot(m, 'status-mobile')
  }
  console.log('\nAll waitlist checks passed.')
} finally {
  await browser.close()
  await sql.end()
}

async function post(base, path, token) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
  assert.ok(res.ok, `${path} ${res.status}`)
}
