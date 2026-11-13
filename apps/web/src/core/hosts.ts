// Host names that may reach ReLife (checked in src/proxy.ts against DNS rebinding): loopback names, Tailscale
// (`*.ts.net`, as in `tailscale serve`) and anything listed in RELIFE_ALLOWED_HOSTS (comma-separated, e.g. a
// Cloudflare Tunnel name; `*.example.com` matches its subdomains).

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** The host name without its port, lower-cased. */
export function hostName(host: string) {
  const h = host.trim().toLowerCase()
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0]
}

/** Whether a Host header value may reach ReLife. */
export function allowedHost(host: string | null, extra = process.env.RELIFE_ALLOWED_HOSTS ?? '') {
  if (!host) return false
  const name = hostName(host)
  if (LOOPBACK.has(name) || name.endsWith('.ts.net')) return true
  return extra.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    .some((p) => (p.startsWith('*.') ? name.endsWith(p.slice(1)) : name === hostName(p)))
}

