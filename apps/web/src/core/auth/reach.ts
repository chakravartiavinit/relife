import brand from '@relife/brand/brand.json'
import { allowedHost, hostName } from '../hosts'
import { env } from '../env'
import { tailscaleName, tailscaleServing } from './base-url'
import { inDocker, lanIps } from './lan'
import { bindIsLoopback, isLoopbackHost, requestOrigin } from './trust'

// Which address can a phone open? "Use on your phone" (plan Phase 4 §A) lists every way this server can be reached, says which
// work now and what to change for the rest, and builds the pairing QR from the one the user picks. The rules are pure
// (`reachOptions`, tested in reach.test.ts); `loadReach` gathers the facts.

const RESTART = `Restart ${brand.name} after you edit .env.`

export type ReachId = 'origin' | 'tailscale' | 'lan' | 'public'
export type ReachState = 'ready' | 'needs-setup' | 'unavailable'
export type ReachFix = {
  label: string
  /** Lines for .env, copied as they are. */
  envLines?: string[]
  /** A command to run in a terminal. */
  command?: string
  /** A page to read or a download. */
  href?: string
  /** Plain-words consequences of this change. */
  notes?: string[]
}
export type ReachOption = {
  id: ReachId
  /** What the phone opens (the QR carries `<url>/pair#s=…`). Null when there is none yet. */
  url: string | null
  state: ReachState
  https: boolean
  fixes: ReachFix[]
  /** `lan` only: every private address found, the first of which is `url`. */
  addresses?: string[]
}

export type ReachInput = {
  /** The Host header of the request the page is served on. */
  host: string | null
  /** The address this page was opened on, when it is not loopback (`requestOrigin`). */
  origin: string | null
  port: number
  bind?: string
  hostname?: string
  allowedHosts?: string
  publicUrl?: string
  lanIps: string[]
  tailscale: { name: string | null; serving: boolean }
  inDocker: boolean
}

const trim = (u: string) => u.trim().replace(/\/+$/, '')
const withHost = (existing: string | undefined, host: string) => [...(existing ?? '').split(',').map((x) => x.trim()).filter(Boolean), host].filter((x, i, a) => a.indexOf(x) === i).join(',')

/** Every way a phone could reach this server, in display order, with its state. Pure. */
export function reachOptions(i: ReachInput): ReachOption[] {
  const out: ReachOption[] = []
  const wide = !bindIsLoopback({ RELIFE_BIND: i.bind, HOSTNAME: i.hostname })

  // 1. The address this page is already open on, when it is not loopback.
  if (i.origin) out.push({ id: 'origin', url: trim(i.origin), state: 'ready', https: i.origin.startsWith('https://'), fixes: [] })

  // 2. Tailscale: the private network that reaches a phone anywhere, with https from `tailscale serve`.
  const onTs = !!i.host && hostName(i.host).endsWith('.ts.net')
  if (i.tailscale.name) {
    const url = `https://${i.tailscale.name}`
    const ready = onTs || i.tailscale.serving
    out.push({
      id: 'tailscale', url, state: ready ? 'ready' : 'needs-setup', https: true,
      fixes: ready ? [] : [{ label: 'Turn on Tailscale Serve for this server', command: `tailscale serve --bg ${i.port}`, notes: ['It gives this server an https address on your tailnet, so the phone can install the web app and get notifications.'] }],
    })
  } else {
    out.push({
      id: 'tailscale', url: null, state: 'unavailable', https: true,
      fixes: i.inDocker
        ? [{ label: 'The container has no Tailscale. Use your own https address below, or run Tailscale on the host and point RELIFE_PUBLIC_URL at it.', envLines: ['RELIFE_PUBLIC_URL=https://your-server.your-tailnet.ts.net'] }]
        : [{ label: 'Install Tailscale on this computer and on your phone, then sign in to both', href: 'https://tailscale.com/download' }],
    })
  }

  // 3. The local network: the same Wi-Fi, plain http.
  const ips = i.lanIps
  if (i.inDocker) {
    out.push({
      id: 'lan', url: null, state: 'needs-setup', https: false,
      fixes: [{ label: 'Use your server’s own address on your network (not the container’s)', envLines: ['RELIFE_PUBLIC_URL=http://<your server’s address>:3030', 'RELIFE_ALLOWED_HOSTS=<your server’s address>'] }],
    })
  } else if (!ips.length) {
    out.push({ id: 'lan', url: null, state: 'unavailable', https: false, fixes: [{ label: 'This computer has no address on a local network. Connect it to Wi-Fi or Ethernet.' }] })
  } else {
    const ip = ips[0]
    const ready = wide && allowedHost(ip, i.allowedHosts ?? '')
    out.push({
      id: 'lan', url: `http://${ip}:${i.port}`, state: ready ? 'ready' : 'needs-setup', https: false, addresses: ips,
      fixes: ready ? [] : [{
        label: 'Let this server listen on your local network',
        envLines: ['RELIFE_BIND=0.0.0.0', `RELIFE_ALLOWED_HOSTS=${ips.reduce((acc, a) => withHost(acc, a), i.allowedHosts)}`],
        notes: [
          RESTART,
          'After the restart, “trust this Mac” turns off: a new browser on this Mac signs in with npm run signin.',
          'It is plain http, so there is no web app install and no notifications on this address.',
          'Running the dev server? Add the address to NEXT_ALLOWED_DEV_ORIGINS too.',
        ],
      }],
    })
  }

  // 4. Your own address: RELIFE_PUBLIC_URL (a reverse proxy, a Cloudflare Tunnel, a domain).
  const pub = i.publicUrl ? trim(i.publicUrl) : ''
  let pubHost = ''
  try { pubHost = pub ? new URL(pub).host : '' } catch { /* not a URL */ }
  if (pub && pubHost) {
    const ready = allowedHost(pubHost, i.allowedHosts ?? '')
    out.push({
      id: 'public', url: pub, state: ready ? 'ready' : 'needs-setup', https: pub.startsWith('https://'),
      fixes: ready ? [] : [{ label: 'Allow this address to reach the server', envLines: [`RELIFE_ALLOWED_HOSTS=${withHost(i.allowedHosts, hostName(pubHost))}`], notes: [RESTART] }],
    })
  } else {
    out.push({
      id: 'public', url: null, state: 'unavailable', https: true,
      fixes: [{ label: 'Set the address you reach this server on from outside (a domain, a Cloudflare Tunnel, a reverse proxy)', envLines: ['RELIFE_PUBLIC_URL=https://relife.example.com', 'RELIFE_ALLOWED_HOSTS=relife.example.com'], notes: [RESTART] }],
    })
  }

  // The page's own address stands for whichever option it is: do not list the same address twice.
  const origin = out.find((o) => o.id === 'origin')
  return origin ? out.filter((o) => o.id === 'origin' || o.url !== origin.url) : out
}

const RANK = (o: ReachOption) => (o.id === 'origin' ? 0 : o.id === 'tailscale' ? 1 : o.id === 'public' && o.https ? 2 : o.id === 'lan' ? 3 : 4)

/** The option to start from: the page's own address, Tailscale, a public https address, the local network, anything else that is ready. Null when none is. */
export function defaultReach(options: ReachOption[]): ReachOption | null {
  return options.filter((o) => o.state === 'ready').sort((a, b) => RANK(a) - RANK(b))[0] ?? null
}

/** Gather the facts and run the rules. `fresh` skips the 5-minute Tailscale cache (the page's "Check again"). */
export async function loadReach(h: { get(n: string): string | null }, o: { fresh?: boolean } = {}) {
  const host = h.get('host')
  const port = Number(host?.match(/:(\d+)$/)?.[1]) || 3030
  const name = await tailscaleName(Date.now(), o.fresh)
  const serving = name ? await tailscaleServing(port, { fresh: o.fresh }) : false
  const options = reachOptions({
    host, port, origin: isLoopbackHost(host) ? null : requestOrigin(h),
    bind: env('RELIFE_BIND'), hostname: env('HOSTNAME'), allowedHosts: env('RELIFE_ALLOWED_HOSTS'), publicUrl: env('RELIFE_PUBLIC_URL'),
    lanIps: lanIps(), tailscale: { name, serving }, inDocker: inDocker(),
  })
  return { options, default: defaultReach(options)?.id ?? null, port }
}
