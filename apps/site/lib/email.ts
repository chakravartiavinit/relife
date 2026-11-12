// Email provider interface. `console` prints the message (local dev), `resend` posts to the Resend HTTP API.
export type Email = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }
export interface EmailDriver { send(mail: Email): Promise<void> }

// The console driver prints the whole message, including the live /w/<token> link. That is a local-dev convenience
// and the only place a token is ever printed, so it must never run where logs are kept: not on Vercel, and not in
// a production run except a local preview build (SITE_ALLOW_UNREADY_BRAND=1, which next.config.ts refuses on Vercel).
const consoleDriver: EmailDriver = {
  async send(m) {
    console.log(`\n[email:console] to=${m.to} subject="${m.subject}"\n${m.text}\n`)
  },
}

const resendDriver: EmailDriver = {
  async send(m) {
    const key = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!key || !from) throw new Error('EMAIL_DRIVER=resend needs RESEND_API_KEY and EMAIL_FROM')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
    })
    if (!res.ok) {
      // The response body can echo the recipient address, so only its error name is kept.
      const name = await res.json().then((b: { name?: unknown }) => (typeof b?.name === 'string' ? b.name : ''), () => '')
      throw new Error(`resend ${res.status} ${name}`.trim())
    }
  },
}

export function emailDriver(): EmailDriver {
  const production = process.env.NODE_ENV === 'production'
  const name = process.env.EMAIL_DRIVER ?? (production ? '' : 'console')
  if (!name) throw new Error('EMAIL_DRIVER is not set. Use resend in production (console is for local dev only).')
  if (name === 'resend') return resendDriver
  if (name === 'console') {
    const localPreview = process.env.SITE_ALLOW_UNREADY_BRAND === '1' && !process.env.VERCEL
    if (production && !localPreview) throw new Error('EMAIL_DRIVER=console would log live confirmation links; it only runs in dev or a local preview build.')
    return consoleDriver
  }
  throw new Error(`Unknown EMAIL_DRIVER "${name}" (console or resend)`)
}
