// Recovery and first sign-in from the shell: shell access to the server means ownership. Prints a one-time sign-in link
// (valid 10 minutes) and a QR for it. Open the link in any browser, or scan it with a phone that can reach this server.
//
//   npm run signin                              from a checkout
//   docker compose exec web relife signin      in Docker
//   relife web                                  runs `signin --first-run` before the server starts: a code only while
//                                               no device is signed in, so a restart doesn't print a new one every time
import brand from '@relife/brand/brand.json'
import { and, gt, isNull } from 'drizzle-orm'
import { renderANSI } from 'uqr'
import { db, schema, sql } from '@/db'
import { pairBase } from '@/core/auth/base-url'
import { formatCode } from '@/core/auth/tokens'
import { createOffer } from '@/core/auth/pairing'
import { inContainer } from '@/core/platform'
import { getUser } from '@/core/user'

async function main() {
  const firstRun = process.argv.includes('--first-run')
  const user = await getUser()
  if (firstRun) {
    const [live] = await db.select({ id: schema.devices.id }).from(schema.devices).where(and(isNull(schema.devices.revokedAt), gt(schema.devices.expiresAt, new Date()))).limit(1)
    if (live) { await sql.end(); return }
  }
  const container = inContainer()
  const local = `http://127.0.0.1:${process.env.PORT ?? 3030}`
  // Over Tailscale or a public URL when one is set up; otherwise this Mac's own address.
  const { url } = await pairBase({ get: (n) => (n === 'host' ? '127.0.0.1' : null) })
  // Inside a container 127.0.0.1 is the container's own address: no link from it works for you. The code does, from any address.
  const base = url ?? (container ? null : local)
  const offer = await createOffer({ userId: user.id, deviceId: null, baseUrl: base ?? local, method: 'cli' })
  const code = formatCode(offer.userCode)
  if (firstRun) {
    const bar = '─'.repeat(64)
    console.log(`\n${bar}\n  First sign-in: open ${brand.name}, go to /pair and type ${code} (valid 10 minutes).\n  Expired? Run: docker compose exec web relife signin\n${bar}\n`)
    if (base) console.log(`  Or open ${base}/pair#s=${offer.secret}\n`)
    await sql.end()
    return
  }
  console.log(`\nSign in to ${brand.name} as ${user.name}. This code works once and expires in 10 minutes.\n`)
  if (base) {
    const link = `${base}/pair#s=${offer.secret}`
    console.log(renderANSI(link, { border: 1 }))
    console.log(`  ${link}\n`)
    if (base !== local && !container) console.log(`  On this Mac: ${local}/pair#s=${offer.secret}`)
    console.log(`  Or open ${base}/pair and type the code ${code}\n`)
  } else {
    console.log(`  Open ${brand.name} in your browser, go to /pair and type the code ${code}\n`)
  }
  await sql.end()
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
