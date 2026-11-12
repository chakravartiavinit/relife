import { NextResponse, type NextRequest } from 'next/server'
import { allowedHost } from '@/core/hosts'

// ReLife has no sign-in: anyone who can reach the port sees everything. The port is bound to 127.0.0.1, but a
// web page can still reach it through DNS rebinding (its own domain re-pointed at 127.0.0.1), and the browser
// then treats ReLife's pages and server actions as that page's own. Checking the Host header stops it: a
// rebound request carries the attacker's domain, not one of ours.
//
// What is allowed: src/core/hosts.ts.

export function proxy(req: NextRequest) {
  if (allowedHost(req.headers.get('host'))) return NextResponse.next()
  return new NextResponse('ReLife refused this address. Add it to RELIFE_ALLOWED_HOSTS in .env to allow it.', { status: 421 })
}
