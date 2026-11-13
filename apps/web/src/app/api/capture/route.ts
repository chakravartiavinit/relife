import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { loadCapture } from '@/core/capture'

// Capture's suggestions (due routines, goals, usual logs, mood, spends). The client fetches it when Capture opens
// and keeps it until something changes, so it is never cached here.
export async function GET() {
  await connection()
  const user = await getUser()
  return Response.json(await loadCapture(user), { headers: { 'Cache-Control': 'no-store' } })
}
