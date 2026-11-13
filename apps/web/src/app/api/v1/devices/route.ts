import type { DeviceList } from '@relife/contract'
import { authenticate, denied } from '@/core/auth/request'
import { toListItem } from '@/core/auth/device-view'
import { listDevices } from '@/core/auth/devices'

// Everything signed in to this server: what Settings → Devices shows, for the Mac app's account tab too.

export async function GET(req: Request) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const devices = (await listDevices(a.user.id)).map((d) => toListItem(d, a.device.id))
  return Response.json({ devices } satisfies DeviceList)
}
