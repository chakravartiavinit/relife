// Recovery and first sign-in from the shell: shell access to the server means ownership. Prints a one-time sign-in link
// (valid 10 minutes) and a QR for it. Open the link in any browser, or scan it with a phone that can reach this server.
//
//   npm run signin
import brand from '@relife/brand/brand.json'
import { renderANSI } from 'uqr'
import { pairBase } from '@/core/auth/base-url'
import { formatCode } from '@/core/auth/tokens'
import { createOffer } from '@/core/auth/pairing'
import { getUser } from '@/core/user'

async function main() {
  const user = await getUser()
  const local = `http://127.0.0.1:${process.env.PORT ?? 3030}`
  // Over Tailscale or a public URL when one is set up; otherwise this Mac's own address.
  const { url } = await pairBase({ get: (n) => (n === 'host' ? '127.0.0.1' : null) })
  const base = url ?? local
  const offer = await createOffer({ userId: user.id, deviceId: null, baseUrl: base, method: 'cli' })
  const link = `${base}/pair#s=${offer.secret}`
  console.log(`\nSign in to ${brand.name} as ${user.name}. This link works once and expires in 10 minutes.\n`)
  console.log(renderANSI(link, { border: 1 }))
  console.log(`  ${link}\n`)
  if (base !== local) console.log(`  On this Mac: ${local}/pair#s=${offer.secret}`)
  console.log(`  Or open ${base}/pair and type the code ${formatCode(offer.userCode)}\n`)
  process.exit(0)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
