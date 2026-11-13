import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cleanup } from '@/lib/waitlist'

// Daily (vercel.json): deletes pending signups older than 7 days and rate-limit rows older than 24 h.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await cleanup())
}
