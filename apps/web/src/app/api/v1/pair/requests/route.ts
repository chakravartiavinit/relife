import { PairRequestStart, type PairRequestStarted } from '@relife/contract'
import { PairError, startRequest } from '@/core/auth/pairing'
import { apiError } from '@/core/auth/request'
import { clientIp, limitKey, requestOrigin } from '@/core/auth/trust'
import { hostName } from '@/core/hosts'

// Flow B (plan §3): a device asks to be let in and shows the code. Public: anything that can reach the server may ask,
// which is why the approve page names the device and where it asked from, and why only 5 may wait at once.

export async function POST(req: Request) {
  const body = PairRequestStart.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Say what kind of device this is and give it a name.')
  const host = req.headers.get('host') ?? ''
  try {
    const r = await startRequest({
      ...body.data, ip: clientIp(req.headers), bucket: limitKey(req.headers), userAgent: req.headers.get('user-agent') ?? '', baseUrl: requestOrigin(req.headers), via: hostName(host),
    })
    return Response.json({ ...r, expiresAt: r.expiresAt.toISOString() } satisfies PairRequestStarted)
  } catch (e) {
    if (e instanceof PairError) return apiError(e.code === 'rate_limited' ? 429 : 400, e.code === 'expired' ? 'expired' : e.code, e.message, { retryAfter: e.retryAfter })
    throw e
  }
}
