import { connection } from 'next/server'
import { authenticate, denied } from '@/core/auth/request'
import { ExportBusy, exportBusy, exportFileName, exportZip, streamOf } from '@/core/data/export'

const busy = () => Response.json({ error: new ExportBusy().message }, { status: 409, headers: { 'Cache-Control': 'no-store' } })

// Everything you have, as one ZIP (core/data/export.ts). Streamed, so a large history never sits in memory. One export
// at a time: a second gets 409. `?probe=1` only asks whether one is running (the Data page checks before it starts the
// download, so a busy export shows as a message and not as a broken file). Allowed in the read-only demo: it is a read,
// and the data is mock.
export async function GET(req: Request) {
  await connection()
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  if (new URL(req.url).searchParams.has('probe')) return (await exportBusy()) ? busy() : new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  const it = exportZip(a.user)
  // The lock is taken on the first step: run it now so a busy export is a 409, before any headers say "a file is coming".
  let first: IteratorResult<Uint8Array>
  try { first = await it.next() } catch (e) { if (e instanceof ExportBusy) return busy(); throw e }
  return new Response(streamOf(it, first), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportFileName(a.user)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
