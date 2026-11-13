import { connection } from 'next/server'
import { apiError, authenticate, denied } from '@/core/auth/request'
import { appendChunk, cancelImport } from '@/core/imports'
import { CHUNK_BYTES } from '@/domain/imports'

// Chunked upload for file imports. The edge proxy buffers a request body in memory and cuts it at 10 MB, and server
// actions stop at 1 MB, so the browser sends the file as raw chunks of at most 8 MiB, in order. `?offset=` must equal
// the bytes received so far; a mismatch answers 409 `{ expected }` so the client resumes from there.
const UUID = /^[0-9a-f-]{36}$/i

export async function PUT(req: Request, ctx: RouteContext<'/api/import/[id]'>) {
  await connection()
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  if (!UUID.test(id)) return apiError(404, 'not_found', 'Import not found')
  const offset = Number(new URL(req.url).searchParams.get('offset'))
  if (!Number.isSafeInteger(offset) || offset < 0) return apiError(400, 'bad_request', 'offset must be a whole number')
  const announced = Number(req.headers.get('content-length'))
  if (announced > CHUNK_BYTES) return apiError(413, 'bad_request', 'A chunk is at most 8 MiB')
  const body = Buffer.from(await req.arrayBuffer())
  const r = await appendChunk(a.user, id, offset, body)
  if (!r.ok) {
    return Response.json({ ok: false, error: { code: r.status === 404 ? 'not_found' : 'bad_request', message: r.error }, expected: r.expected }, { status: r.status })
  }
  return Response.json({ ok: true, received: r.received })
}

export async function DELETE(req: Request, ctx: RouteContext<'/api/import/[id]'>) {
  await connection()
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  if (!UUID.test(id)) return apiError(404, 'not_found', 'Import not found')
  try { await cancelImport(a.user, id) } catch { return apiError(404, 'not_found', 'Import not found') }
  return Response.json({ ok: true })
}
