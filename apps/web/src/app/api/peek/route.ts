import { headers } from 'next/headers'
import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { loadPeek } from '@/core/peek'
import { requestOrigin } from '@/core/oauth'
import { parsePeek } from '@/domain/peek'

// The data behind `?peek=type:id`. The PeekHost fetches it when a peek opens and again when something changes, so
// it is never cached. 400 for a malformed ref, 404 when the item is gone, 500 (JSON) when a loader throws.
export async function GET(req: Request) {
  await connection()
  const ref = parsePeek(new URL(req.url).searchParams.get('ref'))
  if (!ref) return Response.json({ error: 'bad ref' }, { status: 400 })
  try {
    const data = await loadPeek(await getUser(), ref, { origin: requestOrigin(await headers()) })
    return data ? Response.json(data, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'gone' }, { status: 404 })
  } catch (e) {
    console.error('[peek]', ref.type, e instanceof Error ? e.message : e)
    return Response.json({ error: 'failed' }, { status: 500 })
  }
}
