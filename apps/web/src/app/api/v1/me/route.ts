import type { Me } from '@relife/contract'
import { authenticateAny, denied } from '@/core/auth/request'

// Open to any scope (an ingest-only phone app asks who it is signed in as too). Who this device signs in as, and the account state every surface shares (name, time zone, theme).

export async function GET(req: Request) {
  const a = await authenticateAny(req)
  if (!a.ok) return denied(a)
  const me: Me = {
    name: a.user.name, timezone: a.user.timezone, prefs: { theme: a.user.profile.prefs?.theme ?? 'system' },
    device: { id: a.device.id, kind: a.device.kind, name: a.device.name, scopes: a.device.scopes },
  }
  return Response.json(me)
}
