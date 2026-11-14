import type { Scope } from '@relife/contract'
import { allowedHost, hostName } from '../hosts'
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
// What `-H` was given, as far as the app can tell: only RELIFE_BIND says it (package.json and service.sh set it next to
// `-H`). Next does not tell the app its bind address, and a client can send `X-Forwarded-For: 127.0.0.1` itself, so
// a server whose bind is unknown (`next start -H 0.0.0.0` with no RELIFE_BIND) must not be assumed to be loopback-only:
// with nothing set the answer is no, and "trust this Mac" stays off. HOSTNAME counts too when it is an address (a
// container started with HOSTNAME=0.0.0.0): a wide one overrides RELIFE_BIND.
const ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f]*:[0-9a-f:]+\]?)$/i

/** Whether the server is declared to listen on this Mac only. Unset or anything wider means a loopback Host may not be from this Mac. */
export function bindIsLoopback(env: Env = process.env) {
  const bind = env.RELIFE_BIND?.trim().toLowerCase()
  if (!bind || !LOOPBACK_BIND.test(bind)) return false
  const hostname = env.HOSTNAME?.trim().toLowerCase()
  return !(hostname && ADDRESS.test(hostname) && !LOOPBACK_BIND.test(hostname))
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

/**
 * A known proxy puts the real address in X-Forwarded-For: Tailscale (`*.ts.net`) in self-host, any host in cloud. The
 * client can write that header too and the proxy adds to it, so the address is the rightmost hop that is not this
 * machine (the one our own proxy wrote), never the first. 'local' when there is none to trust.
 */
export function clientIp(h: Headers, opts: { mode?: Mode } = {}) {
  const host = h.get('host')
  const proxied = (opts.mode ?? mode()) === 'cloud' || (!!host && hostName(host).endsWith('.ts.net'))
  if (!proxied) return 'local'
  const hops = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  const hop = hops.reverse().find((x) => !LOOPBACK_IPS.has(x))
  return hop && /^[0-9a-f:.]{2,45}$/i.test(hop) ? hop : 'local'
}

/**
 * What a failed code or a request is counted against. A known address, else this Mac ('local'), else the tunnel name
 * the request came through: a visitor through a Cloudflare Tunnel (whose address we do not trust) shares a limit with
 * that tunnel only, not with the Mac's own browser.
 */
export function limitKey(h: Headers, opts: { mode?: Mode } = {}) {
  const ip = clientIp(h, opts)
  const host = h.get('host')
  return ip !== 'local' || !host || isLoopbackHost(host) ? ip : `host:${hostName(host)}`
}

/** Plain-HTTP loopback cannot use the `__Host-` prefix (it needs Secure). Mock mode gets its own name: cookies ignore ports. */
export function cookieName(secure: boolean, mock = process.env.RELIFE_MOCK === '1') {
  const base = mock ? 'relife-mock' : 'relife'
  return secure ? `__Host-${base}` : base
}

const first = (v: string | null) => v?.split(',')[0].trim() || undefined // proxies chain values with commas

/**
 * Whether the client reached the server over HTTPS. The server itself only ever sees plain HTTP behind `tailscale serve`
 * or a tunnel, so the answer comes from X-Forwarded-Proto, and only when a proxy we know of is in front: a Host that is
 * not loopback, or a forwarded host we allow. A direct loopback connection is HTTP whatever a client claims.
 */
export function isSecureRequest(h: Headers) {
  const fwdHost = first(h.get('x-forwarded-host'))
  const proxied = !isLoopbackHost(h.get('host')) || (!!fwdHost && allowedHost(fwdHost))
  return proxied && first(h.get('x-forwarded-proto'))?.toLowerCase() === 'https'
}

/**
 * The address the client used to reach the server. `req.url` is not reliable for this (Next reports `localhost` even
 * when you opened 127.0.0.1), and the redirect address registered with an OAuth service must match it exactly. A
 * forwarded host counts only when it is one we allow.
 */
export function requestOrigin(h: Headers) {
  const fwdHost = first(h.get('x-forwarded-host'))
  const host = fwdHost && allowedHost(fwdHost) ? fwdHost : h.get('host') ?? '127.0.0.1:3030'
  return `${isSecureRequest(h) ? 'https' : 'http'}://${host}`
}

export function readCookie(header: string | null, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

/** A cookie value as the token it holds; a value that is not valid percent-encoding is no token. */
function decodeCookie(v: string | undefined) {
  if (!v) return undefined
  try { return decodeURIComponent(v) } catch { return undefined }
}

/** The session token in a request's cookie: only the name its own protocol allows (`__Host-` over HTTPS, the plain one over HTTP), never the other. */
export const sessionCookieOf = (h: Headers) => decodeCookie(readCookie(h.get('cookie'), cookieName(isSecureRequest(h))))

/** The session token a request carries: bearer first, then the cookie. */
export function tokenOf(h: Headers) {
  const bearer = h.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (bearer) return { token: bearer, via: 'bearer' as const }
  const c = sessionCookieOf(h)
  return c ? { token: c, via: 'cookie' as const } : null
}

/** `full` opens everything. `companion` and `ingest` open only themselves. */
export const scopeAllows = (have: readonly Scope[], need: Scope) => have.includes('full') || have.includes(need)

/** The default scopes of a kind: the extension is `companion`; everything else is `full`. */
export const scopesFor = (kind: string): Scope[] => (kind === 'extension' ? ['companion'] : ['full'])

/**
 * The scopes a new device gets: what it asked for, kept only where the kind's default allows it, so a request can narrow
 * (the Android app asks for `ingest` only) but never widen (an extension asking for `full` stays `companion`).
 * `full` allows every scope, so a kind that defaults to `full` may ask for any narrower one.
 */
export function narrowScopes(requested: readonly Scope[] | undefined, kind: string): Scope[] {
  const base = scopesFor(kind)
  if (!requested?.length) return base
  const kept = [...new Set(requested)].filter((s) => scopeAllows(base, s))
  return kept.length ? kept : base
}

/** Paths that need no sign-in. `/api/health` stays loopback-only (checked by the gate). */
export function isPublicPath(pathname: string) {
  return pathname === '/signin' || pathname === '/pair' || pathname === '/join' || pathname === '/api/v1/hello' || pathname.startsWith('/api/v1/pair/')
    || pathname === '/manifest.webmanifest' || pathname === '/icon.png' || pathname === '/apple-icon.png' || pathname === '/favicon.ico'
    || pathname.startsWith('/_next/') || pathname.startsWith('/brand/') || pathname === '/sw.js'
}
