import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { PairPoll } from '@relife/contract'
import { PairError, poll } from '@/core/auth/pairing'
import { apiError, sameOrigin, sessionCookie } from '@/core/auth/request'
import { toInfo } from '@/core/auth/device-view'

// The device polls every 2 s. `approved` comes back exactly once: a browser or phone gets the cookie, the Mac app and the
// extension get `token`. Faster polling gets 429 `slow_down` (as in RFC 8628).

export async function POST(req: Request, ctx: RouteContext<'/api/v1/pair/requests/[id]/poll'>) {
  if (!sameOrigin(req.headers)) return apiError(403, 'forbidden', 'This request came from another site.')
  const { id } = await ctx.params
  const body = z.object({ pollSecret: z.string().min(1).max(100) }).safeParse(await req.json().catch(() => null))
  if (!body.success || !z.uuid().safeParse(id).success) return apiError(400, 'bad_request', 'Bad request.')
  try {
    const r = await poll(id, body.data.pollSecret)
    if (r.status !== 'approved') return Response.json({ status: r.status } satisfies PairPoll)
    const native = r.kind === 'mac' || r.kind === 'extension' || r.kind === 'cli'
    const res = NextResponse.json((native ? { status: 'approved', token: r.token, device: toInfo(r.device) } : { status: 'approved', device: toInfo(r.device) }) satisfies PairPoll)
    if (!native) { const c = sessionCookie(r.token, req.headers.get('host')); res.cookies.set(c.name, c.value, c.options) }
    return res
  } catch (e) {
    if (e instanceof PairError) return apiError(e.code === 'rate_limited' ? 429 : 404, e.code === 'expired' ? 'expired' : e.code, e.message, { retryAfter: e.retryAfter })
    throw e
  }
}
