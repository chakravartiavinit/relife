import { authenticate, denied } from '@/core/auth/request'
import { readCoinLogo } from '@/core/coin-logos'

// A coin's saved logo (data/coins), so pages never load it from the web.
export async function GET(req: Request, ctx: RouteContext<'/api/coins/[symbol]'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const file = await readCoinLogo((await ctx.params).symbol)
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(file.buf), { headers: { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=604800' } })
}
