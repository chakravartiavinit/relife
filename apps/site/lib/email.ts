// Email provider interface. `console` prints the message (local dev), `resend` posts to the Resend HTTP API.
export type Email = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }
export interface EmailDriver { send(mail: Email): Promise<void> }

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
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`)
  },
}

export function emailDriver(): EmailDriver {
  const name = process.env.EMAIL_DRIVER ?? 'console'
  if (name === 'resend') return resendDriver
  if (name === 'console') return consoleDriver
  throw new Error(`Unknown EMAIL_DRIVER "${name}" (console or resend)`)
}
