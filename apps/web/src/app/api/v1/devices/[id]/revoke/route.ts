import { apiError, authenticate, denied } from '@/core/auth/request'
import { isDeviceId, revokeDevice } from '@/core/auth/devices'

// Sign a device out for good. `me` is the caller itself (a client's own "Sign out").

export async function POST(req: Request, ctx: RouteContext<'/api/v1/devices/[id]/revoke'>) {
  const a = await authenticate(req, 'companion')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  if (id !== 'me' && !isDeviceId(id)) return apiError(404, 'not_found', 'That device wasn’t found.')
  if (id !== 'me' && id !== a.device.id && !a.device.scopes.includes('full')) return apiError(403, 'forbidden', 'This device can only sign itself out.')
  const ok = await revokeDevice(a.user.id, id === 'me' ? a.device.id : id)
  return ok ? Response.json({ ok: true }) : apiError(404, 'not_found', 'That device wasn’t found.')
}
