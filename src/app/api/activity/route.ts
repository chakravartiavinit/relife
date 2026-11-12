import { ActivityBatch as body } from '@relife/contract'
import { extensionAuthorized, extensionDenied, markExtensionSeen } from '@/core/companion'
import { getUser } from '@/core/user'
import { popupView, recordSegments, setSiteKind, siteKind, trackCourse } from '@/core/activity'

// The browser extension posts stretches of focused time here, every minute or so.
// Auth: the ACTIVITY_TOKEN set on Connectors → Laptop activity, sent as a bearer token.
// Only reachable from this machine unless you expose the port yourself.

export async function POST(req: Request) {
  const user = await getUser() // loads saved keys, including ACTIVITY_TOKEN
  if (!extensionAuthorized(req)) return extensionDenied()
  await markExtensionSeen()
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
  const ok = extensionAuthorized(req)
  if (!ok) return Response.json({ ok }, { status: 401 })
  await markExtensionSeen()
  const q = new URL(req.url).searchParams
  // ?view=1 is the extension popup: this site today, today's split and the tracked item (?item=<its url>).
  if (q.get('view')) return Response.json({ ok, app: 'ReLife', ...(await popupView(user, q.get('domain'), q.get('item'))) })
  const domain = q.get('domain')
  return Response.json({ ok, app: 'ReLife', ...(domain ? { site: await siteKind(user, domain) } : {}) })
}
