import { apiError, authenticate, denied } from '@/core/auth/request'
import { hostName } from '@/core/hosts'
import { saveSubscription, SubscriptionInput } from '@/core/push'

// The service worker re-subscribes by itself when the push service replaces a subscription (`pushsubscriptionchange`), and
// tells the server here. The server action in app/push-actions.ts is the page's way to do the same.

export async function POST(req: Request) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const body = SubscriptionInput.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Bad request.')
  const host = req.headers.get('host')
  await saveSubscription({ userId: a.user.id, deviceId: a.device.id, sub: body.data, via: host ? hostName(host) : null, userAgent: req.headers.get('user-agent') })
  return Response.json({ ok: true })
}
