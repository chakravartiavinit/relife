import { NextResponse, type NextRequest } from 'next/server'
import { allowedHost } from '@/core/hosts'
import { findByToken, touchIfDue } from '@/core/auth/devices'
import { mintLoopbackDevice, requireSignIn } from '@/core/auth/loopback'
import { apiError, sessionCookie } from '@/core/auth/request'
import { cookieName, hasProxyHeaders, isLoopbackHost, isPublicPath, loopbackTrusted, readCookie, scopeAllows } from '@/core/auth/trust'

// Two checks at the edge of ReLife.
//
// 1. Host. A web page can reach the local port through DNS rebinding (its own domain re-pointed at 127.0.0.1), and the
//    browser then treats ReLife's pages and server actions as that page's own. A rebound request carries the attacker's
//    domain in Host, not one of ours (src/core/hosts.ts says what is allowed).
// 2. Sign-in. Every request needs a device (src/core/auth, plan §2): a bearer token goes to the route, which checks it
//    itself; otherwise the session cookie is checked here. No valid cookie on loopback mints one ("trust this Mac");
//    anywhere else pages go to /signin and API calls and server actions get 401 JSON.

export async function proxy(req: NextRequest) {
  const host = req.headers.get('host')
  if (!allowedHost(host)) return new NextResponse('ReLife refused this address. Add it to RELIFE_ALLOWED_HOSTS in .env to allow it.', { status: 421 })

  const { pathname, search } = req.nextUrl
  // The health probe is for this Mac only.
  if (pathname === '/api/health') return isLoopbackHost(host) && !hasProxyHeaders(req.headers) ? NextResponse.next() : new NextResponse('Not found', { status: 404 })
  if (isPublicPath(pathname)) return NextResponse.next()

  const api = pathname.startsWith('/api/')
  // A bearer token goes to the route, which calls authenticate(req, scope) itself.
  if (api && /^Bearer\s+\S+/i.test(req.headers.get('authorization') ?? '')) return NextResponse.next()

  const cookie = readCookie(req.headers.get('cookie'), cookieName(false)) ?? readCookie(req.headers.get('cookie'), cookieName(true))
  let reason: 'revoked' | 'expired' | undefined
  if (cookie) {
    const found = await findByToken(decodeURIComponent(cookie))
    if (found.ok && scopeAllows(found.device.scopes, 'full')) {
      const res = NextResponse.next()
      // Stay signed in: re-set the cookie (a fresh Max-Age) whenever last_seen is refreshed.
      if (await touchIfDue(found.device).catch(() => false)) {
        const c = sessionCookie(decodeURIComponent(cookie), host)
        res.cookies.set(c.name, c.value, c.options)
      }
      return res
    }
    if (!found.ok && (found.reason === 'revoked' || found.reason === 'expired')) reason = found.reason
  }

  if (loopbackTrusted(req.headers, { requireSignIn: await requireSignIn().catch(() => false) })) {
    const token = await mintLoopbackDevice(host ?? '127.0.0.1', req.headers.get('user-agent') ?? '')
    const c = sessionCookie(token, host)
    // Forward the new cookie to this very request too, so the page that is about to render already sees it.
    const headers = new Headers(req.headers)
    const old = (headers.get('cookie') ?? '').split(';').filter((p) => ![cookieName(false), cookieName(true)].includes(p.split('=')[0].trim())).join(';')
    headers.set('cookie', `${old ? old + '; ' : ''}${c.name}=${encodeURIComponent(token)}`)
    const res = NextResponse.next({ request: { headers } })
    res.cookies.set(c.name, c.value, c.options)
    return res
  }

  if (api || req.headers.has('next-action')) {
    return reason === 'revoked' ? apiError(401, 'revoked', 'This device was disconnected from ReLife.')
      : reason === 'expired' ? apiError(401, 'expired', 'Your sign-in ended. Connect this device again.')
        : apiError(401, 'unauthorized', 'Sign in to ReLife first.')
  }
  const to = new URL('/signin', req.url)
  if (pathname !== '/') to.searchParams.set('next', pathname + search)
  if (reason) to.searchParams.set('reason', reason)
  return NextResponse.redirect(to)
}
