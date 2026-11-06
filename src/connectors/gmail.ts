import type { Connector } from '@/core/types'
import { env } from '@/core/env'

// Gmail REST with a read-only OAuth refresh token (scripts/gmail-auth.ts). No googleapis dependency.

const DEFAULT_QUERY =
  'from:(axisbank.com OR zomato.com OR swiggy.in OR zepto.co.in OR zeptonow.com OR blinkit.com) ' +
  'OR subject:("pre-debit" OR "will be debited" OR mandate)'

type Cursor = { after?: number } // unix seconds
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] }
type Message = { id: string; threadId: string; internalDate: string; labelIds?: string[]; payload: Part & { headers?: { name: string; value: string }[] } }

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GMAIL_CLIENT_ID')!,
      client_secret: env('GMAIL_CLIENT_SECRET')!,
      refresh_token: env('GMAIL_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  })
  const j = (await res.json()) as { access_token?: string; error_description?: string; error?: string }
  if (!j.access_token) throw new Error(`Gmail auth failed: ${j.error_description ?? j.error ?? res.status}. Re-run scripts/gmail-auth.ts`)
  return j.access_token
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

function findPart(p: Part, mime: string): string | undefined {
  if (p.mimeType === mime && p.body?.data) return b64(p.body.data)
  for (const c of p.parts ?? []) {
    const hit = findPart(c, mime)
    if (hit) return hit
  }
}

/** Readable text from HTML emails: keep line structure, drop tags, decode common entities. */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export const gmail: Connector = {
  id: 'gmail',
  name: 'Gmail',
  category: 'wealth',
  description: 'Bank alerts, UPI mandates and Zomato, Swiggy, Blinkit and Zepto order emails, parsed into transactions.',
  provides: ['Bank alerts', 'Orders', 'Mandates'],
  fields: [
    { env: 'GMAIL_CLIENT_ID', label: 'OAuth client ID', placeholder: '…apps.googleusercontent.com' },
    { env: 'GMAIL_CLIENT_SECRET', label: 'OAuth client secret', secret: true },
    { env: 'GMAIL_REFRESH_TOKEN', label: 'Refresh token', secret: true, hint: 'Run npx tsx --env-file=.env scripts/gmail-auth.ts once to get it. Read-only access.' },
  ],
  env: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
  everyMinutes: 15,
  async sync(ctx) {
    const token = await accessToken()
    const api = async <T>(path: string) => {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`Gmail HTTP ${res.status} on ${path.split('?')[0]}`)
      return (await res.json()) as T
    }
    const cursor = (ctx.cursor as Cursor | null) ?? {}
    const q = `(${process.env.GMAIL_QUERY || DEFAULT_QUERY}) ${cursor.after ? `after:${cursor.after}` : 'newer_than:30d'}`

    let maxSeen = cursor.after ?? 0
    let pageToken: string | undefined
    // ponytail: 5 pages (500 emails) per run; the cursor makes the next run continue.
    for (let page = 0; page < 5; page++) {
      const list = await api<{ messages?: { id: string }[]; nextPageToken?: string }>(
        `messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`,
      )
      for (const { id } of list.messages ?? []) {
        const m = await api<Message>(`messages/${id}?format=full`)
        const header = (n: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? ''
        const text = findPart(m.payload, 'text/plain') ?? htmlToText(findPart(m.payload, 'text/html') ?? '')
        const at = new Date(Number(m.internalDate))
        maxSeen = Math.max(maxSeen, Math.floor(at.getTime() / 1000))
        await ctx.emit({
          source: 'gmail', externalId: m.id, at,
          body: { id: m.id, threadId: m.threadId, from: header('from'), subject: header('subject'), date: header('date'), text: text.slice(0, 20_000) },
        })
      }
      pageToken = list.nextPageToken
      if (!pageToken) break
    }
    // An hour of overlap: Gmail's after: is coarse; duplicates are dropped by message id.
    if (maxSeen) ctx.setCursor({ after: maxSeen - 3600 } satisfies Cursor)
  },
}
