import { connection } from 'next/server'
import { authenticate, denied } from '@/core/auth/request'
import { loadCapture } from '@/core/capture'

// Capture's suggestions (due routines, goals, usual logs, mood, spends). The client fetches it when Capture opens
// and keeps it until something changes, so it is never cached here.
export async function GET(req: Request) {
  await connection()
  // The gate lets any valid bearer token through; this route needs a full-scope device, like the other dashboard APIs.
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const user = a.user
  return Response.json(await loadCapture(user), { headers: { 'Cache-Control': 'no-store' } })
}
