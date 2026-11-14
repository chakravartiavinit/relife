import { execFile } from 'node:child_process'
import { allowedHost } from '../hosts'
import { env } from '../env'
import { inDocker, lanIps } from './lan'
import { bindIsLoopback, isLoopbackHost, requestOrigin } from './trust'

// What URL goes in the QR (plan §3 "Reachability"): the dashboard's own origin when it is not loopback; RELIFE_PUBLIC_URL;
// the Tailscale name from `tailscale status --json` (a suggestion: `tailscale serve` has to be on); this Mac's address on the
// local network when the server listens there; else none. The "Use on your phone" page (reach.ts) lets the user pick instead.

export type PairBase = { url: string | null; source: 'origin' | 'env' | 'tailscale' | 'lan' | 'none' }

let cached: { at: number; dns: string | null } | undefined
/** The Tailscale DNS name of this machine, cached for 5 minutes (failures too). */
export function tailscaleName(now = Date.now(), fresh = false): Promise<string | null> {
  if (!fresh && cached && now - cached.at < 5 * 60_000) return Promise.resolve(cached.dns)
  return new Promise((resolve) => {
    execFile('tailscale', ['status', '--json'], { timeout: 2000, maxBuffer: 4_000_000 }, (err, out) => {
      let dns: string | null = null
      if (!err) {
        try { dns = (JSON.parse(out) as { Self?: { DNSName?: string } }).Self?.DNSName?.replace(/\.$/, '') || null } catch { /* not JSON */ }
      }
      cached = { at: now, dns }
      resolve(dns)
    })
  })
}

let servingCache: { at: number; port: number; on: boolean } | undefined
/**
 * Whether `tailscale serve` already proxies this port (it shows in `tailscale serve status --json` as a Proxy to
 * 127.0.0.1 or localhost on the port). Cached for 5 minutes like the name; `fresh` skips the cache for "Check again".
 */
export function tailscaleServing(port: number, o: { now?: number; fresh?: boolean } = {}): Promise<boolean> {
  const now = o.now ?? Date.now()
  if (!o.fresh && servingCache && servingCache.port === port && now - servingCache.at < 5 * 60_000) return Promise.resolve(servingCache.on)
  return new Promise((resolve) => {
    execFile('tailscale', ['serve', 'status', '--json'], { timeout: 2000, maxBuffer: 1_000_000 }, (err, out) => {
      let on = false
      if (!err) on = new RegExp(`"Proxy"\\s*:\\s*"https?://(127\\.0\\.0\\.1|localhost):${port}\\b`).test(out)
      servingCache = { at: now, port, on }
      resolve(on)
    })
  })
}

export async function pairBase(h: { get(n: string): string | null }): Promise<PairBase> {
  if (!isLoopbackHost(h.get('host'))) return { url: requestOrigin(h), source: 'origin' }
  const pub = env('RELIFE_PUBLIC_URL')?.trim().replace(/\/$/, '')
  if (pub) return { url: pub, source: 'env' }
  const dns = await tailscaleName()
  if (dns) return { url: `https://${dns}`, source: 'tailscale' }
  // The local network, when the server really listens there and allows the address (a phone on the same Wi-Fi).
  const ip = !inDocker() && !bindIsLoopback() ? lanIps().find((a) => allowedHost(a)) : undefined
  const port = h.get('host')?.match(/:(\d+)$/)?.[1] ?? '3030'
  return ip ? { url: `http://${ip}:${port}`, source: 'lan' } : { url: null, source: 'none' }
}
