// Two parallel submits of the same new address (the unique email race): exactly one email goes out and its link
// works. Runs joinWaitlist in-process with the console email driver and reads the link from what it prints.
//   NODE_ENV=development npx tsx --env-file=apps/site/.env.local apps/site/scripts/race-check.ts
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { waitlistSignups as t } from '@/db/schema'
import { hashToken } from '@/lib/crypto'
import { joinWaitlist } from '@/lib/waitlist'

async function main() {
  assert.match(process.env.SITE_DATABASE_URL ?? '', /localhost|127\.0\.0\.1/, 'local database only')
  const printed: string[] = []
  const log = console.log
  console.log = (...a: unknown[]) => { printed.push(a.join(' ')) }
  try {
    for (let round = 0; round < 5; round++) {
      const email = `race${round}@example.com`
      printed.length = 0
      await db().delete(t).where(eq(t.email, email))
      const input = { email, interests: [], platforms: [] }
      const results = await Promise.all([joinWaitlist(input, `10.7.${round}.1`), joinWaitlist(input, `10.7.${round}.2`)])
      assert.deepEqual(results, ['sent', 'sent'])
      const mails = printed.filter((m) => m.includes(`to=${email} `))
      assert.equal(mails.length, 1, `round ${round}: one email, got ${mails.length}`)
      const token = mails[0].match(/\/w\/([A-Za-z0-9_-]+)/)?.[1]
      assert.ok(token, 'the email carries a link')
      const [row] = await db().select({ h: t.tokenHash }).from(t).where(eq(t.email, email))
      assert.equal(row.h, hashToken(token), `round ${round}: the emailed token is the stored one`)
      await db().delete(t).where(eq(t.email, email))
    }
  } finally {
    console.log = log
  }
  console.log('race check passed: 5 rounds, one email each, link valid')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
