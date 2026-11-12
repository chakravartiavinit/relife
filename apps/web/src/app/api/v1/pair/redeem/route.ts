import { PairRedeem, type PairRedeemResult } from '@relife/contract'
import { redeem, PairError } from '@/core/auth/pairing'
import { apiError, sameOrigin, sessionCookie } from '@/core/auth/request'
import { clientIp } from '@/core/auth/trust'
import { toInfo } from '@/core/auth/device-view'
import { hostName } from '@/core/hosts'
import { NextResponse } from 'next/server'

// Flow A (plan §3): the new device redeems a QR secret or the typed code. Public. A browser or phone gets the session
// cookie and `next`; the Mac app and the extension get `token` in the body. The cookie-setting POST must come from
// this very site (Origin = Host), so another page can't make a visitor's browser join someone else's ReLife.

export async function POST(req: Request) {
  if (!sameOrigin(req.headers)) return apiError(403, 'forbidden', 'This request came from another site.')
  const body = PairRedeem.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Enter the 8-character code, or open the link again.')
  const host = req.headers.get('host')
  try {
    const r = await redeem({
      ...body.data, ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') ?? '', via: host ? hostName(host) : '',
    })
    const native = r.device.kind === 'mac' || r.device.kind === 'extension' || r.device.kind === 'cli'
    const result: PairRedeemResult = native ? { ok: true, device: toInfo(r.device), token: r.token } : { ok: true, device: toInfo(r.device), next: '/' }
    const res = NextResponse.json(result)
    if (!native) { const c = sessionCookie(r.token, host); res.cookies.set(c.name, c.value, c.options) }
    return res
  } catch (e) {
    if (e instanceof PairError) return apiError(e.code === 'rate_limited' ? 429 : e.code === 'forbidden' ? 403 : 404, e.code === 'expired' ? 'expired' : e.code, e.message, { retryAfter: e.retryAfter })
    throw e
  }
}

