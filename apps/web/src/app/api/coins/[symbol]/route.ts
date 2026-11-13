import { readCoinLogo } from '@/core/coin-logos'

// A coin's saved logo (data/coins), so pages never load it from the web.
export async function GET(_req: Request, ctx: RouteContext<'/api/coins/[symbol]'>) {
  const file = await readCoinLogo((await ctx.params).symbol)
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(file.buf), { headers: { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=604800' } })
}
