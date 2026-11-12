import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { authenticate, denied } from '@/core/auth/request'
import { readCover } from '@/core/library-images'

// A library item's saved cover picture (data/library), so pages never load it from the web.
export async function GET(req: Request, ctx: RouteContext<'/api/library/[id]/image'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  const user = a.user
  const [item] = await db.select({ image: schema.learningItems.image }).from(schema.learningItems)
    .where(and(eq(schema.learningItems.id, id), eq(schema.learningItems.userId, user.id)))
  const file = item?.image ? await readCover(item.image) : null
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(file.buf), { headers: { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=86400' } })
}
