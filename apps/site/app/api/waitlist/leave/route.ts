import { NextResponse } from 'next/server'
import { leaveWaitlist } from '@/lib/waitlist'
import { back, readToken } from '../_token'

export async function POST(req: Request) {
  const { token, isForm } = await readToken(req)
  if (!token || token.length > 100) return isForm ? back(req, '/') : NextResponse.json({ error: 'invalid' }, { status: 400 })
  try {
    const left = await leaveWaitlist(token)
    if (isForm) return back(req, `/w/${encodeURIComponent(token)}?left=1`)
    return NextResponse.json({ left })
  } catch (e) {
    console.error('leave failed', e)
    return isForm ? back(req, `/w/${encodeURIComponent(token)}`) : NextResponse.json({ error: 'server' }, { status: 500 })
  }
}
