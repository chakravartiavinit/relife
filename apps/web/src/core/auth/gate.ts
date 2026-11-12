import brand from '@relife/brand/brand.json'
import { NextResponse, type NextRequest } from 'next/server'
import { allowedHost } from '../hosts'
import { findByToken, touchIfDue } from './devices'
import { mintLoopbackDevice, requireSignIn } from './loopback'
import { apiError, sessionCookie } from './request'
import { cookieName, hasProxyHeaders, isLoopbackHost, isPageNavigation, isPublicPath, loopbackTrusted, readCookie, scopeAllows } from './trust'

// The edge check behind src/proxy.ts, with its lookups passed in so it can be tested without a database (gate.test.ts).
//
// 1. Host. A web page can reach the local port through DNS rebinding (its own domain re-pointed at 127.0.0.1), and the
//    browser then treats the app's pages and server actions as that page's own. A rebound request carries the attacker's
//    domain in Host, not one of ours (src/core/hosts.ts says what is allowed).
// 2. Sign-in. Every request needs a device (src/core/auth, plan §2): a bearer token is checked here and its scope by the
//    route; otherwise the session cookie is checked here. No valid cookie on loopback mints one ("trust this Mac") but
//    only for a person navigating to a page (isPageNavigation): a cross-site form post, an <img> or a curl gets nothing,
//    so no web page can use the trust to write data or fill the device list. Anywhere else a page goes to /signin and an
//    API call or server action gets 401 JSON.

export type GateDeps = {
  findByToken: typeof findByToken
  touchIfDue: typeof touchIfDue
  requireSignIn: () => Promise<boolean>
  mintLoopbackDevice: (host: string, userAgent: string) => Promise<string>
}

export const realDeps: GateDeps = { findByToken, touchIfDue, requireSignIn: () => requireSignIn().catch(() => false), mintLoopbackDevice }

/** These routes answered `{ error: string }` before device tokens; extensions before 0.7 still read that. */
const LEGACY_BODY = new Set(['/api/companion', '/api/activity', '/api/ingest'])

export async function gate(req: NextRequest, deps: GateDeps = realDeps): Promise<NextResponse | Response> {
  const host = req.headers.get('host')
  if (!allowedHost(host)) return new NextResponse(`${brand.name} refused this address. Add it to RELIFE_ALLOWED_HOSTS in .env to allow it.`, { status: 421 })

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
    const found = await deps.findByToken(decodeURIComponent(cookie))
    if (found.ok && scopeAllows(found.device.scopes, 'full')) {
      const res = NextResponse.next()
      // Stay signed in: re-set the cookie (a fresh Max-Age) whenever last_seen is refreshed.
      if (await deps.touchIfDue(found.device).catch(() => false)) {
        const c = sessionCookie(decodeURIComponent(cookie), host)
        res.cookies.set(c.name, c.value, c.options)
      }
      return res
    }
    if (!found.ok && (found.reason === 'revoked' || found.reason === 'expired')) reason = found.reason
  }

  if (isPageNavigation(req.method, req.headers) && loopbackTrusted(req.headers, { requireSignIn: await deps.requireSignIn() })) {
    const token = await deps.mintLoopbackDevice(host ?? '127.0.0.1', req.headers.get('user-agent') ?? '')
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
    return reason === 'revoked' ? apiError(401, 'revoked', `This device was disconnected from ${brand.name}.`, { legacy: LEGACY_BODY.has(pathname) })
      : reason === 'expired' ? apiError(401, 'expired', 'Your sign-in ended. Connect this device again.', { legacy: LEGACY_BODY.has(pathname) })
        : apiError(401, 'unauthorized', `Sign in to ${brand.name} first.`, { legacy: LEGACY_BODY.has(pathname) })
  }
  const to = new URL('/signin', req.url)
  if (pathname !== '/') to.searchParams.set('next', pathname + search)
  if (reason) to.searchParams.set('reason', reason)
  return NextResponse.redirect(to)
}
