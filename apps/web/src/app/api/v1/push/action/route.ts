import { eq, and } from 'drizzle-orm'
import { PushAction, type PushActionResult } from '@relife/contract'
import { db, schema } from '@/db'
import { apiError, authenticate, denied } from '@/core/auth/request'
import { runAction } from '@/core/notify-actions'
import { markAnsweredById } from '@/core/outbox'
import { actionAllowed, parseAction } from '@/domain/push'

// A button tapped on a web push notification (public/sw.js posts here with the session cookie). It must be one of that
// message's own buttons, and it runs the same core function the Telegram button runs. Any answer stops the repeats, on
// every channel, because the channels share one row.

export async function POST(req: Request) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const body = PushAction.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Bad request.')
  const N = schema.notifications
  const [row] = await db.select().from(N).where(and(eq(N.id, body.data.id), eq(N.userId, a.user.id))).limit(1)
  if (!row) return apiError(404, 'not_found', 'That message is gone.')
  const op = actionAllowed(body.data.action, row) ? parseAction(body.data.action) : null
  if (!op) return apiError(400, 'bad_request', 'That button is not on this message.')
  const r = await runAction(a.user, op)
  if (op.type !== 'open') await markAnsweredById(a.user.id, row.id)
  return Response.json({ ok: true, text: r.text, ...(r.url ? { url: r.url } : {}) } satisfies PushActionResult)
}
