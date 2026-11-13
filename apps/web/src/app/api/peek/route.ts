import { headers } from 'next/headers'
import { connection } from 'next/server'
import { authenticate, denied } from '@/core/auth/request'
import { loadPeek } from '@/core/peek'
import { requestOrigin } from '@/core/auth/trust'
import { parsePeek } from '@/domain/peek'

// The data behind `?peek=type:id`. The PeekHost fetches it when a peek opens and again when something changes, so
// it is never cached. 400 for a malformed ref, 404 when the item is gone, 500 (JSON) when a loader throws.
export async function GET(req: Request) {
  await connection()
  // The gate lets any valid bearer token through; this route needs a full-scope device, like the other dashboard APIs.
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const ref = parsePeek(new URL(req.url).searchParams.get('ref'))
  if (!ref) return Response.json({ error: 'bad ref' }, { status: 400 })
  try {
    const data = await loadPeek(a.user, ref, { origin: requestOrigin(await headers()) })
    return data ? Response.json(data, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'gone' }, { status: 404 })
  } catch (e) {
    console.error('[peek]', ref.type, e instanceof Error ? e.message : e)
    return Response.json({ error: 'failed' }, { status: 500 })
  }
}
