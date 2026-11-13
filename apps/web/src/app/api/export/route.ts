import { connection } from 'next/server'
import { authenticate, denied } from '@/core/auth/request'
import { exportFileName, exportZip, streamOf } from '@/core/data/export'

// Everything you have, as one ZIP (core/data/export.ts). Streamed, so a large history never sits in memory. Allowed in
// the read-only demo: it is a read, and the data is mock.
export async function GET(req: Request) {
  await connection()
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  return new Response(streamOf(exportZip(a.user)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportFileName(a.user)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
