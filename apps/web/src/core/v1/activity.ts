import { ActivityBatch as body } from '@relife/contract'
import { BROWSER_APPS } from '@/domain/activity'
import { popupView, recordSegments, setSiteKind, siteKind, trackCourse } from '../activity'
import { authenticate, apiError, denied } from '../auth/request'
import { updateMeta, type DeviceMeta } from '../auth/devices'

// The extension posts stretches of focused time here every minute or so; the Mac app posts front-app stretches.
// Scope `companion` or `full`. /api/activity is the same under its old name (`legacy` keeps its `{ error: string }` bodies).

type Opts = { legacy?: boolean }

export async function postActivity(req: Request, o: Opts = {}) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a, o)
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ ok: false, error: o.legacy ? 'bad request' : { code: 'bad_request', message: 'Bad request.' }, issues: parsed.error.issues.slice(0, 3) }, { status: 400 })
  // The browser filter has one home, here: a browser in front on the Mac is the extension's time, not the app's.
  const segments = parsed.data.segments.filter((s) => s.source !== 'mac' || !BROWSER_APPS.test(s.app))
  const days = await recordSegments(a.user, segments)
  // "Track this course" from the extension: create (or update) the course right away.
  for (const c of parsed.data.courses) await trackCourse(a.user, c.domain.replace(/^www\./, ''), c.path, { ...c, track: true })
  // "Counts as" from the popup.
  for (const r of parsed.data.rules) await setSiteKind(a.user, r.domain, r.kind)
  // A Mac app that sends app time tells the worker's watcher to stand down (src/worker/mac-activity.ts).
  if (a.device.kind === 'mac' && parsed.data.segments.some((s) => s.source === 'mac') && !(a.device.meta as DeviceMeta).watcher) await updateMeta(a.device.id, { watcher: true })
  return Response.json({ ok: true, saved: segments.length, courses: parsed.data.courses.length, days })
}

/** The extension's "Save and test"; with ?domain=, what that site counts as; with ?view=1, the popup's data. */
export async function getActivity(req: Request, o: Opts = {}) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a, o)
  const q = new URL(req.url).searchParams
  // ?view=1 is the extension popup: this site today, today's split and the tracked item (?item=<its url>).
  if (q.get('view')) return Response.json({ ok: true, app: 'ReLife', ...(await popupView(a.user, q.get('domain'), q.get('item'))) })
  const domain = q.get('domain')
  return Response.json({ ok: true, app: 'ReLife', ...(domain ? { site: await siteKind(a.user, domain) } : {}) })
}

