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
 * traffic arrives with a *.ts.net Host and X-Forwarded-For, so it never qualifies. Cloud mode never trusts.
 */
export function loopbackTrusted(h: Headers, opts: { mode?: Mode; requireSignIn?: boolean } = {}) {
  if ((opts.mode ?? mode()) !== 'self-host' || opts.requireSignIn) return false
  return isLoopbackHost(h.get('host')) && !hasProxyHeaders(h)
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
