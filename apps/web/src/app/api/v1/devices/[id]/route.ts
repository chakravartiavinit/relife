import { DeviceRename } from '@relife/contract'
import { apiError, authenticate, denied } from '@/core/auth/request'
import { renameDevice } from '@/core/auth/devices'

export async function PATCH(req: Request, ctx: RouteContext<'/api/v1/devices/[id]'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  const body = DeviceRename.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Give the device a name.')
  const ok = await renameDevice(a.user.id, id === 'me' ? a.device.id : id, body.data.name)
  return ok ? Response.json({ ok: true }) : apiError(404, 'not_found', 'That device wasn’t found.')
}
