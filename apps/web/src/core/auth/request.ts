import brand from '@relife/brand/brand.json'
import { eq } from 'drizzle-orm'
import type { ApiError, Scope } from '@relife/contract'
import { db, schema } from '@/db'
import { getUser, warmInstance, type User } from '../user'
import { findByToken, touchIfDue, type Device } from './devices'
import { COOKIE_MAX_AGE_S } from './mode'
import { DEMO_MESSAGE, demoDevice, demoMethodAllowed, isDemo } from '../demo'
import { cookieName, isSecureRequest, scopeAllows, tokenOf } from './trust'

// Checks used by route handlers, server actions and server components. The edge check is src/proxy.ts; a route always
// calls authenticate() itself (defense in depth).

export type AuthFail = 'missing' | 'invalid' | 'revoked' | 'expired' | 'scope' | 'csrf' | 'demo'
export type Authed = { ok: true; device: Device; user: User; via: 'bearer' | 'cookie' }
export type Denied = { ok: false; reason: AuthFail }

/** `Authorization: Bearer` first, then the cookie. Writes last_seen at most every 5 minutes. */
export async function authenticate(req: Request, scope: Scope): Promise<Authed | Denied> {
  // Read the request before any database call: that makes `next build` treat the route as dynamic instead of
  // prerendering it (a prerender would query the database, which the Docker build doesn't have).
  const t = tokenOf(req.headers)
  // The read-only demo: everyone is one synthetic browser, for reads only (the gate has already refused the rest).
  if (isDemo()) {
    const me = await getUser() // the demo has one person
    return demoMethodAllowed(req.method) && req.method !== 'OPTIONS' ? { ok: true, device: demoDevice(me.id), user: me, via: 'cookie' } : { ok: false, reason: 'demo' }
  }
  await warmInstance() // the server's keys, and with them the legacy ACTIVITY_TOKEN and INGEST_TOKEN rows, exist before the lookup
  if (!t) return { ok: false, reason: 'missing' }
  const found = await findByToken(t.token)
  if (!found.ok) return { ok: false, reason: found.reason }
  if (t.via === 'cookie' && !cookieWriteAllowed(req.method, req.headers)) return { ok: false, reason: 'csrf' }
  if (!scopeAllows(found.device.scopes, scope)) return { ok: false, reason: 'scope' }
  await touchIfDue(found.device).catch((e) => console.error('[auth] touch failed', e instanceof Error ? e.message : e))
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, found.device.userId)).limit(1)
  if (!user || user.disabledAt) return { ok: false, reason: 'invalid' }
  return { ok: true, device: found.device, user, via: t.via }
}

/** For routes any signed-in device may call (signing itself out): a `companion` check, else `ingest`. `full` passes the first. */
export async function authenticateAny(req: Request): Promise<Authed | Denied> {
  const a = await authenticate(req, 'companion')
  return !a.ok && a.reason === 'scope' ? authenticate(req, 'ingest') : a
}

const MESSAGES: Record<AuthFail, [ApiError['error']['code'], number, string]> = {
  missing: ['unauthorized', 401, `Connect this device to your ${brand.name} first.`],
  invalid: ['unauthorized', 401, `This device isn’t connected to your ${brand.name}. Connect it again.`],
  revoked: ['revoked', 401, `This device was disconnected from ${brand.name}.`],
  expired: ['expired', 401, 'Your sign-in ended. Connect this device again.'],
  scope: ['forbidden', 403, 'This device isn’t allowed to do that.'],
  csrf: ['forbidden', 403, 'This request did not come from this site.'],
  demo: ['forbidden', 403, DEMO_MESSAGE],
}

/** A JSON error. `legacy` keeps the old `{ error: string }` body that extensions before 0.7 read. */
export function apiError(status: number, code: ApiError['error']['code'], message: string, o: { legacy?: boolean; retryAfter?: number } = {}) {
  const body = o.legacy ? { ok: false, error: message } : ({ ok: false, error: { code, message } } satisfies ApiError)
  return Response.json(body, { status, headers: o.retryAfter ? { 'Retry-After': String(o.retryAfter) } : undefined })
}

export function denied(d: Denied, o: { legacy?: boolean } = {}) {
  const [code, status, message] = MESSAGES[d.reason]
  return apiError(status, code, message, o)
}

// ── Cookies ──────────────────────────────────────────────────────────────────────────────────────

/** Set-Cookie for a browser or phone session: HttpOnly, SameSite=Lax, 400 days, `__Host-` and Secure on HTTPS. */
export function sessionCookie(token: string, h: { get(n: string): string | null }) {
  const secure = isSecureRequest(h)
  return { name: cookieName(secure), value: token, options: { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: COOKIE_MAX_AGE_S } }
}

/** A cookie-setting POST must come from this page: Origin, when sent, has to match Host. Native clients send none. */
export function sameOrigin(h: { get(n: string): string | null }) {
  const origin = h.get('origin')
  if (!origin) return true
  try { return new URL(origin).host === h.get('host') } catch { return false }
}

/**
 * The Chrome extension's pages and worker send `Origin: chrome-extension://<32 letters>` on a POST, which is never the
 * server's Host. The pairing routes accept it (the extension is a native client: it gets a token, never a cookie).
 */
export const fromExtension = (h: { get(n: string): string | null }) => /^chrome-extension:\/\/[a-p]{32}$/.test(h.get('origin') ?? '')

/** The pairing routes' check: this site's own pages, native clients (no Origin) and the extension. */
export const pairOriginAllowed = (h: { get(n: string): string | null }) => sameOrigin(h) || fromExtension(h)

/**
 * A write that rides on the session cookie must come from this site. SameSite=Lax does not stop a cross-origin
 * `text/plain` POST from a page on another port of this Mac (same site), and a browser attaches the cookie to it. Origin,
 * when sent, has to match Host, and Sec-Fetch-Site, when sent, has to say same-origin (or none: the user typed it).
 * Reads are left alone. A bearer token is not a cookie, so no browser attaches it for a page: callers that send one skip this.
 */
export function cookieWriteAllowed(method: string, h: { get(n: string): string | null }) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
  const site = h.get('sec-fetch-site')
  return sameOrigin(h) && (site === null || site === 'same-origin' || site === 'none')
}
