import brand from '@relife/brand/brand.json'
import { NextResponse, type NextRequest } from 'next/server'
import { allowedHost } from '../hosts'
import { safeNext } from './next'
import { warmInstance } from '../user'
import { DEMO_HEADER, DEMO_MESSAGE, demoMethodAllowed, isDemo } from '../demo'
import { findByToken, touchIfDue } from './devices'
import { mintLoopbackDevice, requireSignIn } from './loopback'
import { apiError, cookieWriteAllowed, denied, sessionCookie } from './request'
import { cookieName, hasProxyHeaders, isLoopbackHost, isPageNavigation, isPublicPath, loopbackTrusted, scopeAllows, sessionCookieOf } from './trust'

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
  /** Loads the server's saved keys and the owner's, so the legacy ACTIVITY_TOKEN and INGEST_TOKEN rows exist before a token is looked up. */
  warm: () => Promise<unknown>
  findByToken: typeof findByToken
  touchIfDue: typeof touchIfDue
  requireSignIn: () => Promise<boolean>
  mintLoopbackDevice: (host: string, userAgent: string) => Promise<string>
}

export const realDeps: GateDeps = { warm: warmInstance, findByToken, touchIfDue, requireSignIn: () => requireSignIn().catch(() => false), mintLoopbackDevice }

/** These routes answered `{ error: string }` before device tokens; extensions before 0.7 still read that. */
const LEGACY_BODY = new Set(['/api/companion', '/api/activity', '/api/ingest'])

/**
 * The read-only demo (RELIFE_DEMO=1, src/core/demo.ts): no sign-in, no cookie, no pairing, and nothing that writes. A write
 * is any method but GET, HEAD or OPTIONS, or a server action (`Next-Action`), so there is no list to keep up to date.
 * Reads go on to the page or route, where authenticate() and viewerDevice() answer with the synthetic demo device.
 */
function demoGate(req: NextRequest, host: string | null): NextResponse | Response {
  const { pathname } = req.nextUrl
  if (pathname === '/api/health') return isLoopbackHost(host) && !hasProxyHeaders(req.headers) ? NextResponse.next() : new NextResponse('Not found', { status: 404 })
  if (pathname === '/signin' || pathname === '/pair' || pathname === '/join') return NextResponse.redirect(new URL('/', req.url))
  if (pathname.startsWith('/api/oauth/') || pathname.startsWith('/api/v1/pair/') || !demoMethodAllowed(req.method) || req.headers.has('next-action')) {
    const res = apiError(403, 'forbidden', DEMO_MESSAGE, { legacy: LEGACY_BODY.has(pathname) })
    res.headers.set(DEMO_HEADER, 'read-only')
    return res
  }
  return NextResponse.next()
}

export async function gate(req: NextRequest, deps: GateDeps = realDeps): Promise<NextResponse | Response> {
  const host = req.headers.get('host')
  if (!allowedHost(host)) return new NextResponse(`${brand.name} refused this address. Add it to RELIFE_ALLOWED_HOSTS in .env to allow it, then restart ${brand.name}.`, { status: 421 })

  if (isDemo()) return demoGate(req, host)

  const { pathname, search } = req.nextUrl
  // The health probe is for this Mac only.
  if (pathname === '/api/health') return isLoopbackHost(host) && !hasProxyHeaders(req.headers) ? NextResponse.next() : new NextResponse('Not found', { status: 404 })
  // A server action posts to whatever page the user is on, so a request carrying `Next-Action` is never "public": /signin
  // would otherwise run any action without a session.
  if (isPublicPath(pathname) && !req.headers.has('next-action')) return NextResponse.next()

  const api = pathname.startsWith('/api/')
  // A bearer token is checked here, whatever the route does with it: a route that forgot to authenticate must not be
  // opened by `Authorization: Bearer x`. The route still checks the token's scope (authenticate(req, scope)).
  const bearer = api ? req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] : undefined
  if (bearer) {
    await deps.warm().catch(() => {})
    const found = await deps.findByToken(bearer)
    return found.ok ? NextResponse.next() : denied({ ok: false, reason: found.reason }, { legacy: LEGACY_BODY.has(pathname) })
  }

  const cookie = sessionCookieOf(req.headers)
  let reason: 'revoked' | 'expired' | undefined
  if (cookie) {
    const found = await deps.findByToken(cookie)
    if (found.ok && scopeAllows(found.device.scopes, 'full')) {
      // The cookie rides on every request a browser makes, so a write has to be from this site (cookieWriteAllowed).
      if (!cookieWriteAllowed(req.method, req.headers)) return apiError(403, 'forbidden', 'This request did not come from this site.', { legacy: LEGACY_BODY.has(pathname) })
      const res = NextResponse.next()
      // Stay signed in: re-set the cookie (a fresh Max-Age) whenever last_seen is refreshed.
      if (await deps.touchIfDue(found.device).catch(() => false)) {
        const c = sessionCookie(cookie, req.headers)
        res.cookies.set(c.name, c.value, c.options)
      }
      return res
    }
    if (!found.ok && (found.reason === 'revoked' || found.reason === 'expired')) reason = found.reason
  }

  if (isPageNavigation(req.method, req.headers) && loopbackTrusted(req.headers, { requireSignIn: await deps.requireSignIn() })) {
    const token = await deps.mintLoopbackDevice(host ?? '127.0.0.1', req.headers.get('user-agent') ?? '')
    const c = sessionCookie(token, req.headers)
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
  const next = safeNext(pathname + search, req.nextUrl.origin)
  if (next !== '/') to.searchParams.set('next', next)
  if (reason) to.searchParams.set('reason', reason)
  return NextResponse.redirect(to)
}
