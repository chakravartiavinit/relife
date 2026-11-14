import { connection } from 'next/server'
import { authenticate, denied } from '@/core/auth/request'
import { loadShareData } from '@/core/share-card'
import { isShareKind, isShareSize, parseShow } from '@/domain/share-card'
import { SHARE_FIXTURES } from '@/ui/fixtures/share'
import { renderShareCard } from '@/ui/share/render'

// The share card PNG: `?kind=level|streak|achievement|weekly&ref=&show=<field ids>&theme=light|dark&size=square|story`.
// Drawn here, in process (Satori and Resvg), from the signed-in user's own data: nothing is uploaded, hosted or cached.
// The query only says which card and which fields; the numbers never come from it. 400 for a bad kind or field, 404 for
// a level, achievement or week that is not earned. `fixture=1` draws made-up data for /dev/ui, mock mode and dev only.
export async function GET(req: Request) {
  await connection()
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const q = new URL(req.url).searchParams
  const kind = q.get('kind')
  if (!isShareKind(kind)) return Response.json({ error: 'bad kind' }, { status: 400 })
  const size = q.get('size') ?? 'square', theme = q.get('theme') ?? 'light'
  if (!isShareSize(size) || (theme !== 'light' && theme !== 'dark')) return Response.json({ error: 'bad size or theme' }, { status: 400 })
  const show = parseShow(kind, q.get('show'))
  if (!show) return Response.json({ error: 'bad field' }, { status: 400 })

  let data
  if (q.has('fixture')) {
    if (process.env.RELIFE_MOCK !== '1' && process.env.NODE_ENV === 'production') return Response.json({ error: 'not found' }, { status: 404 })
    data = SHARE_FIXTURES[kind]
  } else {
    const loaded = await loadShareData(a.user, kind, q.get('ref'))
    if (!loaded.ok) return Response.json({ error: loaded.error }, { status: loaded.status })
    data = loaded.data
  }
  const date = new Date().toISOString().slice(0, 10)
  try {
    return await renderShareCard({ data, show, theme, size }, {
      'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="relife-${kind}-${date}.png"`,
    })
  } catch (e) {
    console.error('[share]', kind, e instanceof Error ? e.message : e)
    return Response.json({ error: 'failed' }, { status: 500 })
  }
}
