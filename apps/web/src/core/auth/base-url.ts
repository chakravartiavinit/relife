import { execFile } from 'node:child_process'
import { isLoopbackHost } from './trust'
import { requestOrigin } from './request'

// What URL goes in the QR (plan §3 "Reachability"): the dashboard's own origin when it is not loopback; RELIFE_PUBLIC_URL;
// the Tailscale name from `tailscale status --json` (a suggestion: `tailscale serve` has to be on); else none.

export type PairBase = { url: string | null; source: 'origin' | 'env' | 'tailscale' | 'none' }

let cached: { at: number; dns: string | null } | undefined
/** The Tailscale DNS name of this machine, cached for 5 minutes (failures too). */
export function tailscaleName(now = Date.now()): Promise<string | null> {
  if (cached && now - cached.at < 5 * 60_000) return Promise.resolve(cached.dns)
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

export async function pairBase(h: { get(n: string): string | null }): Promise<PairBase> {
  if (!isLoopbackHost(h.get('host'))) return { url: requestOrigin(h), source: 'origin' }
  const pub = process.env.RELIFE_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (pub) return { url: pub, source: 'env' }
  const dns = await tailscaleName()
  return dns ? { url: `https://${dns}`, source: 'tailscale' } : { url: null, source: 'none' }
}
