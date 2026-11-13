import { lookup as dnsLookup } from 'node:dns/promises'
import type { IncomingHttpHeaders } from 'node:http'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

// Fetching an address that a web page or a user supplied. Without these checks a server-side request can be steered at
// this Mac's own services (localhost, the router, cloud metadata), and the answer read back or acted on.

function list(ranges: [string, number, 4 | 6][]) {
  const l = new BlockList()
  for (const [net, prefix, family] of ranges) l.addSubnet(net, prefix, family === 4 ? 'ipv4' : 'ipv6')
  return l
}

/** This computer and its own network: loopback, private, link-local, CGNAT (Tailscale), unique-local IPv6. */
const LOCAL = list([
  ['127.0.0.0', 8, 4], ['10.0.0.0', 8, 4], ['172.16.0.0', 12, 4], ['192.168.0.0', 16, 4], ['169.254.0.0', 16, 4], ['100.64.0.0', 10, 4],
  ['::1', 128, 6], ['fc00::', 7, 6], ['fe80::', 10, 6],
])
/** Everything that is not a public internet address: LOCAL plus unspecified, reserved, documentation, benchmarking and multicast ranges. */
const NOT_PUBLIC = list([
  ['0.0.0.0', 8, 4], ['192.0.0.0', 24, 4], ['192.0.2.0', 24, 4], ['198.18.0.0', 15, 4], ['198.51.100.0', 24, 4], ['203.0.113.0', 24, 4], ['224.0.0.0', 3, 4],
  ['::', 128, 6], ['ff00::', 8, 6], ['2001:db8::', 32, 6], ['64:ff9b::', 96, 6], ['100::', 64, 6],
])

const bare = (ip: string) => ip.replace(/^\[|\]$/g, '')
const family = (ip: string) => (isIP(ip) === 6 ? 'ipv6' : 'ipv4')
/** `::ffff:10.0.0.1` is the IPv4 address 10.0.0.1: judge it as that. */
const unmap = (ip: string) => ip.toLowerCase().match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] ?? ip

/** An IP literal on this computer or its own network (see LOCAL). */
export function isLocalAddress(ip: string) {
  const a = unmap(bare(ip))
  return isIP(a) !== 0 && LOCAL.check(a, family(a))
}

/** An IP literal on the public internet: not local, not reserved. Anything that is not an IP literal is not public. */
export function isPublicAddress(ip: string) {
  const a = unmap(bare(ip))
  return isIP(a) !== 0 && !LOCAL.check(a, family(a)) && !NOT_PUBLIC.check(a, family(a))
}

/** Every address `host` resolves to (a literal resolves to itself). Empty when it does not resolve. */
export async function resolveAll(host: string) {
  const h = bare(host)
  if (isIP(h)) return [h]
  return (await dnsLookup(h, { all: true }).catch(() => [])).map((a) => a.address)
}

/** Whether `host` is local, by every address it resolves to (one public address is enough to refuse it). */
export async function isLocalHost(host: string) {
  const all = await resolveAll(host)
  return all.length > 0 && all.every(isLocalAddress)
}

/** `fetchPublic` result: the status, headers and body (at most `maxBytes`) of the last response. */
export type Fetched = { status: number; headers: IncomingHttpHeaders; body: Buffer }

/**
 * GET an https address that is on the public internet, or null. Every hop is checked: redirects are followed by hand
 * (at most `maxRedirects`), the connection itself only goes to an address that passed isPublicAddress (the check is in the
 * DNS lookup the socket uses, so a name cannot answer differently between the check and the connection), and the body is
 * read as a stream that stops at `maxBytes` (and a larger Content-Length is refused before reading).
 */
export async function fetchPublic(url: string, o: { maxBytes: number; timeoutMs?: number; maxRedirects?: number; headers?: Record<string, string> }): Promise<Fetched | null> {
  const deadline = Date.now() + (o.timeoutMs ?? 10_000)
  let current = url
  for (let hop = 0; hop <= (o.maxRedirects ?? 3); hop++) {
    const u = new URL(current)
    if (u.protocol !== 'https:' || (isIP(bare(u.hostname)) && !isPublicAddress(u.hostname))) return null
    const res = await get(u, o.headers ?? {}, o.maxBytes, deadline - Date.now())
    if (!res) return null
    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && location) {
      try { current = new URL(location, u).href } catch { return null }
      continue
    }
    return res
  }
  return null // too many redirects
}

function get(u: URL, headers: Record<string, string>, maxBytes: number, timeoutMs: number) {
  return new Promise<Fetched | null>((resolve) => {
    if (timeoutMs <= 0) return resolve(null)
    const req = request(u, {
      headers, timeout: timeoutMs,
      lookup: (host, opts, cb) => {
        dnsLookup(host, { all: true }).then((all) => {
          const ok = all.filter((a) => isPublicAddress(a.address))
          if (!ok.length || ok.length < all.length) return cb(new Error('not a public address'), '', 0)
          const wantAll = (opts as { all?: boolean }).all
          return wantAll ? (cb as unknown as (e: null, a: typeof ok) => void)(null, ok) : cb(null, ok[0].address, ok[0].family)
        }, (e) => cb(e, '', 0))
      },
    }, (res) => {
      const status = res.statusCode ?? 0
      const length = Number(res.headers['content-length'])
      if (length > maxBytes) { res.destroy(); return resolve(null) }
      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (c: Buffer) => {
        size += c.length
        if (size > maxBytes) { res.destroy(); resolve(null) } else chunks.push(c)
      })
      res.on('end', () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    req.end()
  })
}
