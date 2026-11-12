import type { Scope } from '@relife/contract'
import { hostName } from '../hosts'
import { mode, type Mode } from './mode'

// Pure rules about who a request is, with no database: loopback trust, proxy headers, cookie names, scopes.
// They are tested in trust.test.ts; src/proxy.ts and the route checks call them.

type Headers = { get(name: string): string | null }

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])
export const isLoopbackHost = (host: string | null) => !!host && LOOPBACK.has(hostName(host))

/** Set by a proxy or tunnel in front of the app. A request carrying any of them did not come straight from this Mac. */
const PROXY_HEADERS = ['forwarded', 'tailscale-user-login', 'cf-connecting-ip', 'x-real-ip']
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Next adds `X-Forwarded-For: 127.0.0.1` and `X-Forwarded-Host: <Host>` to a request that came straight from this Mac, so
 * their mere presence says nothing. They count only when they say something else: a client address that isn't loopback
 * (`tailscale serve` puts the tailnet address there), or a forwarded host that differs from Host.
 */
export function hasProxyHeaders(h: Headers) {
  if (PROXY_HEADERS.some((n) => h.get(n) !== null)) return true
  const xff = h.get('x-forwarded-for')
  if (xff && xff.split(',').some((ip) => !LOOPBACK_IPS.has(ip.trim()))) return true
  const fwdHost = h.get('x-forwarded-host')
  return !!fwdHost && fwdHost.trim().toLowerCase() !== (h.get('host') ?? '').trim().toLowerCase()
}

/**
 * "Trust this Mac": a loopback Host and no proxy headers get a browser device without asking. `tailscale serve`
 * traffic arrives with a *.ts.net Host and X-Forwarded-For, so it never qualifies. Cloud mode never trusts, and neither
 * does a server that is open to other hosts (trustPossible). Never put a tunnel or proxy in front that rewrites Host to
 * localhost: it would make every visitor look like this Mac.
 */
export function loopbackTrusted(h: Headers, opts: { mode?: Mode; requireSignIn?: boolean; env?: Env } = {}) {
  if ((opts.mode ?? mode()) !== 'self-host' || opts.requireSignIn || !trustPossible(opts.env)) return false
  return isLoopbackHost(h.get('host')) && !hasProxyHeaders(h)
}

type Env = Record<string, string | undefined>
const LOOPBACK_BIND = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)$/
// What `-H` was given, as far as the app can tell: RELIFE_BIND says it outright; HOSTNAME counts when it is an address
// (a container started with HOSTNAME=0.0.0.0). Next itself does not tell the app its bind address, so with neither set
// the app assumes the 127.0.0.1 that every script in package.json passes.
const ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f]*:[0-9a-f:]+\]?)$/i

/** Whether the server listens on this Mac only. Anything wider means a request with a loopback Host may not be from this Mac. */
export function bindIsLoopback(env: Env = process.env) {
  const hostname = env.HOSTNAME?.trim()
  const v = (env.RELIFE_BIND?.trim() || (hostname && ADDRESS.test(hostname) ? hostname : '')).toLowerCase()
  return !v || LOOPBACK_BIND.test(v)
}

/**
 * Loopback trust rests on "a request that says Host: 127.0.0.1 really came from this Mac". That stops being true when a
 * tunnel or reverse proxy rewrites Host to localhost, or the server listens beyond loopback. Naming other hosts in
 * RELIFE_ALLOWED_HOSTS says such a tunnel exists, and a non-loopback bind says it is reachable, so either turns the
 * trust off; every browser then connects by pairing (`npm run signin` on the Mac prints the first link).
 */
export function trustPossible(env: Env = process.env) {
  return !env.RELIFE_ALLOWED_HOSTS?.trim() && bindIsLoopback(env)
}

/**
 * Whether a request is a person opening a page: a top-level GET or HEAD that is not cross-site. Only that may be handed a
 * session by "trust this Mac" (src/core/auth/gate.ts), so a form post, an image, a fetch or a curl from anywhere cannot
 * use the trust. Browsers send Sec-Fetch-* on every request; with none of them (an old browser, a script) the request has
 * to be a GET that asks for HTML.
 */
export function isPageNavigation(method: string, h: Headers) {
  if (method !== 'GET' && method !== 'HEAD') return false
  const site = h.get('sec-fetch-site')
  const mode = h.get('sec-fetch-mode')
  const dest = h.get('sec-fetch-dest')
  if (site === null && mode === null && dest === null) return /\btext\/html\b/i.test(h.get('accept') ?? '')
  return site !== 'cross-site' && (mode === 'navigate' || dest === 'document') && (mode ?? 'navigate') === 'navigate' && (dest ?? 'document') === 'document'
}

/** A known proxy puts the real address in X-Forwarded-For: Tailscale (`*.ts.net`) in self-host, any host in cloud. */
export function clientIp(h: Headers, opts: { mode?: Mode } = {}) {
  const host = h.get('host')
  const proxied = (opts.mode ?? mode()) === 'cloud' || (!!host && hostName(host).endsWith('.ts.net'))
  const first = proxied ? h.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined
  return first && /^[0-9a-f:.]{2,45}$/i.test(first) ? first : 'local'
}

/** Plain-HTTP loopback cannot use the `__Host-` prefix (it needs Secure). Mock mode gets its own name: cookies ignore ports. */
export function cookieName(secure: boolean, mock = process.env.RELIFE_MOCK === '1') {
  const base = mock ? 'relife-mock' : 'relife'
  return secure ? `__Host-${base}` : base
}

/** Anything not on loopback is reached over HTTPS (Tailscale serve, the cloud domain). */
export const isSecureHost = (host: string | null) => !isLoopbackHost(host)

export function readCookie(header: string | null, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

/** The session token a request carries: bearer first, then the cookie (either name). */
export function tokenOf(h: Headers) {
  const bearer = h.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (bearer) return { token: bearer, via: 'bearer' as const }
  const cookie = h.get('cookie')
  const c = readCookie(cookie, cookieName(false)) ?? readCookie(cookie, cookieName(true))
  return c ? { token: decodeURIComponent(c), via: 'cookie' as const } : null
}

/** `full` opens everything. `companion` and `ingest` open only themselves. */
export const scopeAllows = (have: readonly Scope[], need: Scope) => have.includes('full') || have.includes(need)

/** The default scopes of a kind: the extension is `companion`; everything else is `full`. */
export const scopesFor = (kind: string): Scope[] => (kind === 'extension' ? ['companion'] : ['full'])

/** Paths that need no sign-in. `/api/health` stays loopback-only (checked by the gate). */
export function isPublicPath(pathname: string) {
  return pathname === '/signin' || pathname === '/pair' || pathname === '/api/v1/hello' || pathname.startsWith('/api/v1/pair/')
    || pathname === '/manifest.webmanifest' || pathname === '/icon.png' || pathname === '/apple-icon.png' || pathname === '/favicon.ico'
    || pathname.startsWith('/_next/') || pathname.startsWith('/brand/') || pathname === '/sw.js'
}
