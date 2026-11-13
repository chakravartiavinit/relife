import { defaultReach, reachOptions, type ReachInput } from '@/core/auth/reach'

// Sample reach checks for /dev/ui "Phone setup": the real rules (`reachOptions`) fed with made-up machines, so every state the
// page can be in is drawn from the same code that runs on a real server.

const base: ReachInput = {
  host: '127.0.0.1:3030', origin: null, port: 3030, bind: '127.0.0.1', lanIps: ['192.168.1.20'],
  tailscale: { name: null, serving: false }, inDocker: false,
}
const reach = (o: Partial<ReachInput>) => {
  const options = reachOptions({ ...base, ...o })
  return { options, default: defaultReach(options)?.id ?? null, port: o.port ?? 3030 }
}

/** A laptop with nothing set up: no option is ready, so the QR is hidden. */
export const REACH_NOTHING = reach({})
/** Tailscale serving, and the LAN needs a listen address: one ready, one to fix. */
export const REACH_TAILSCALE = reach({ tailscale: { name: 'mac.tail1a2b3.ts.net', serving: true } })
/** Opened through a long ts.net name, with several network interfaces and a public address that needs allowing. */
export const REACH_LONG = reach({
  host: 'a-very-long-machine-name-for-a-home-server.tail1a2b3c4d5e.ts.net', origin: 'https://a-very-long-machine-name-for-a-home-server.tail1a2b3c4d5e.ts.net',
  tailscale: { name: 'a-very-long-machine-name-for-a-home-server.tail1a2b3c4d5e.ts.net', serving: true },
  lanIps: ['192.168.1.20', '10.0.4.7', '172.20.3.9'], publicUrl: 'https://relife.example.com', allowedHosts: '',
})
/** Docker: the container address is never shown. */
export const REACH_DOCKER = reach({ inDocker: true, bind: '0.0.0.0', lanIps: ['172.18.0.3'] })
