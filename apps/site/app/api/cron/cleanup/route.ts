import { NextResponse } from 'next/server'
import { cleanup } from '@/lib/waitlist'

// Daily (vercel.json): deletes pending signups older than 7 days and rate-limit rows older than 24 h.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await cleanup())
}
