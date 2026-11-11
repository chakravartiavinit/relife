import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '@/core/env'
import { getUser } from '@/core/user'
import { popupView, recordSegments, setSiteKind, siteKind, trackCourse } from '@/core/activity'
import { ACTIVITY_KINDS } from '@/domain/activity'

// The browser extension posts stretches of focused time here, every minute or so.
// Auth: the ACTIVITY_TOKEN set on Connectors → Laptop activity, sent as a bearer token.
// Only reachable from this machine unless you expose the port yourself.

const seg = z.object({
  id: z.string().min(1).max(80),
  source: z.literal('browser'),
  domain: z.string().max(200).nullish(),
  path: z.string().max(500).nullish(),
  title: z.string().max(500).nullish(),
  start: z.union([z.string(), z.number()]),
  end: z.union([z.string(), z.number()]),
  meta: z.object({
    channel: z.string().max(200).optional(),
    playing: z.boolean().optional(),
    course: z.object({
      title: z.string().min(1).max(200), lesson: z.string().max(200).optional(),
      done: z.number().optional(), total: z.number().optional(), track: z.boolean().optional(), url: z.string().max(500).optional(),
      kind: z.enum(['course', 'book', 'show', 'video', 'other']).optional(), image: z.string().max(1000).optional(), icon: z.string().max(1000).optional(),
      auto: z.boolean().optional(),
      episode: z.object({
        episode: z.string().max(200).optional(), number: z.number().int().min(0).max(100_000).optional(), season: z.number().int().min(0).max(1000).optional(),
        duration: z.number().min(0).max(86_400).optional(), position: z.number().min(0).max(86_400).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
})
const course = z.object({
  domain: z.string().min(1).max(200), path: z.string().max(500).default(''),
  title: z.string().min(1).max(200), url: z.string().max(500), done: z.number().optional(), total: z.number().optional(),
  kind: z.enum(['course', 'book', 'show', 'video', 'other']).optional(), image: z.string().max(1000).optional(), icon: z.string().max(1000).optional(), lesson: z.string().max(200).optional(),
})
const rule = z.object({ domain: z.string().min(1).max(200), kind: z.enum(ACTIVITY_KINDS).nullable() })
const body = z.object({ segments: z.array(seg).max(500).default([]), courses: z.array(course).max(20).default([]), rules: z.array(rule).max(20).default([]) })

/** The bearer token matches ACTIVITY_TOKEN, compared in constant time. */
function authorized(req: Request, token: string) {
  const got = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '')
  const want = Buffer.from(token)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function POST(req: Request) {
  const user = await getUser() // loads saved keys, including ACTIVITY_TOKEN
  const token = env('ACTIVITY_TOKEN')
  if (!token) return Response.json({ error: 'Laptop activity is not connected. Set a token on the Connectors page.' }, { status: 503 })
  if (!authorized(req, token)) return Response.json({ error: 'unauthorized: the token doesn’t match the one on Connectors → Laptop activity' }, { status: 401 })
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'bad request', issues: parsed.error.issues.slice(0, 3) }, { status: 400 })
  const days = await recordSegments(user, parsed.data.segments)
  // "Track this course" from the extension: create (or update) the course right away.
  for (const c of parsed.data.courses) await trackCourse(user, c.domain.replace(/^www\./, ''), c.path, { ...c, track: true })
  // "Counts as" from the popup.
  for (const r of parsed.data.rules) await setSiteKind(user, r.domain, r.kind)
  return Response.json({ ok: true, saved: parsed.data.segments.length, courses: parsed.data.courses.length, days })
}

/** The extension's "Save and test"; with ?domain=, what that site counts as; with ?view=1, the popup's data. */
export async function GET(req: Request) {
  const user = await getUser()
  const token = env('ACTIVITY_TOKEN')
  const ok = !!token && authorized(req, token)
  if (!ok) return Response.json({ ok }, { status: 401 })
  const q = new URL(req.url).searchParams
  // ?view=1 is the extension popup: this site today, today's split and the tracked item (?item=<its url>).
  if (q.get('view')) return Response.json({ ok, app: 'ReLife', ...(await popupView(user, q.get('domain'), q.get('item'))) })
  const domain = q.get('domain')
  return Response.json({ ok, app: 'ReLife', ...(domain ? { site: await siteKind(user, domain) } : {}) })
}
