// Totals by interest, platform and source: npm run waitlist:stats -w apps/site
import { db } from '@/db'
import { waitlistSignups as t } from '@/db/schema'

async function main() {
  const rows = await db().select().from(t)
  const confirmed = rows.filter((r) => r.status === 'confirmed')
  const tally = (pick: (r: (typeof rows)[number]) => string[]) => {
    const m = new Map<string, number>()
    for (const r of confirmed) for (const k of pick(r)) m.set(k, (m.get(k) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }
  const show = (title: string, entries: [string, number][]) => {
    console.log(`\n${title}`)
    for (const [k, n] of entries) console.log(`  ${k.padEnd(24)} ${n}`)
    if (!entries.length) console.log('  (none)')
  }

  console.log(`Signups: ${rows.length}  confirmed: ${confirmed.length}  pending: ${rows.length - confirmed.length}`)
  console.log(`Confirm rate: ${rows.length ? Math.round((confirmed.length / rows.length) * 100) : 0}%`)
  console.log(`Referral credits: ${confirmed.reduce((a, r) => a + r.referralCount, 0)}`)
  show('Interests (confirmed)', tally((r) => r.interests))
  show('Platforms (confirmed)', tally((r) => r.platforms))
  show('Sources (confirmed)', tally((r) => [r.source ?? '(direct)']))
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })
