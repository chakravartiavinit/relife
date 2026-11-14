import { PairJoin, type PairJoinResult } from '@relife/contract'
import { redeemInvite, PairError } from '@/core/auth/pairing'
import { apiError, pairOriginAllowed, sessionCookie } from '@/core/auth/request'
import { clientIp, limitKey } from '@/core/auth/trust'
import { toInfo } from '@/core/auth/device-view'
import { hostName } from '@/core/hosts'
import { clearUserCache } from '@/core/user'
import { NextResponse } from 'next/server'

// Flow C: someone opened an invite link (`/join#s=<secret>`) and chose a name. Public. It makes the person (a member) and their
// first browser, and sets the session cookie, so this POST has to come from this very site (Origin = Host), like the other
// cookie-setting pairing route.

export async function POST(req: Request) {
  if (!pairOriginAllowed(req.headers)) return apiError(403, 'forbidden', 'This request came from another site.')
  const body = PairJoin.safeParse(await req.json().catch(() => null))
  if (!body.success) return apiError(400, 'bad_request', 'Enter your name, or open the invite link again.')
  const host = req.headers.get('host')
  try {
    const r = await redeemInvite({
      ...body.data, ip: clientIp(req.headers), bucket: limitKey(req.headers), userAgent: req.headers.get('user-agent') ?? '', via: host ? hostName(host) : '',
    })
    clearUserCache() // the list of people changed
    const result: PairJoinResult = { ok: true, device: toInfo(r.device), next: '/welcome' }
    const res = NextResponse.json(result)
    const c = sessionCookie(r.token, req.headers)
    res.cookies.set(c.name, c.value, c.options)
    return res
  } catch (e) {
    if (e instanceof PairError) return apiError(e.code === 'rate_limited' ? 429 : e.code === 'forbidden' ? 403 : e.code === 'bad_request' ? 400 : 404, e.code === 'expired' ? 'expired' : e.code, e.message, { retryAfter: e.retryAfter })
    throw e
  }
}
