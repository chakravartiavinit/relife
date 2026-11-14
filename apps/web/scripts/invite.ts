// Invite someone to this server from the shell (the same as Settings → People on this server → Invite someone): prints a
// one-use link (valid 7 days) and a QR for it. Shell access means ownership, so the invite is made as the owner.
//
//   npm run invite                              from a checkout
//   docker compose exec web relife invite       in Docker
import brand from '@relife/brand/brand.json'
import { renderANSI } from 'uqr'
import { sql } from '@/db'
import { pairBase } from '@/core/auth/base-url'
import { createInvite } from '@/core/auth/pairing'
import { INVITE_TTL_MS } from '@/core/auth/mode'
import { inContainer } from '@/core/platform'
import { ensureOwner } from '@/core/user'

async function main() {
  const owner = await ensureOwner()
  const local = `http://127.0.0.1:${process.env.PORT ?? 3030}`
  // Over Tailscale or a public URL when one is set up; otherwise this Mac's address on the network. A link that only opens on
  // this computer is no use to someone else, so there is none to print then.
  const { url } = await pairBase({ get: (n) => (n === 'host' ? '127.0.0.1' : null) })
  const invite = await createInvite({ ownerId: owner.id, deviceId: null, baseUrl: url })
  const days = Math.round(INVITE_TTL_MS / 86_400_000)
  console.log(`\nInvite someone to ${brand.name} on this server. The link works once and expires in ${days} days.\n`)
  if (invite.link) {
    console.log(renderANSI(invite.link, { border: 1 }))
    console.log(`  ${invite.link}\n`)
  } else {
    const hint = inContainer() ? 'Set RELIFE_PUBLIC_URL to the address people reach this server on' : `Set RELIFE_PUBLIC_URL, or serve this over Tailscale (${local} only opens on this computer)`
    console.log(`  No address other people can reach is known. ${hint}, then run this again.\n  The invite is made: add /join#s=<secret> to your server's address. The secret is ${invite.secret}\n`)
  }
  console.log(`  They choose a name and get their own space. You can read everything on your own server, including theirs.\n  Remove people in Settings → People on this server.\n`)
  await sql.end()
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
