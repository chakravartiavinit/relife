import { NextResponse } from 'next/server'
import { confirmToken } from '@/lib/waitlist'
import { back, readToken } from '../_token'

export async function POST(req: Request) {
  const { token, isForm } = await readToken(req)
  if (!token || token.length > 100) return isForm ? back(req, '/') : NextResponse.json({ error: 'invalid' }, { status: 400 })
  try {
    const status = await confirmToken(token)
    if (isForm) return back(req, `/w/${encodeURIComponent(token)}`)
    return status ? NextResponse.json({ status: status.status, position: status.position }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  } catch (e) {
    console.error('confirm failed', e)
    return isForm ? back(req, `/w/${encodeURIComponent(token)}`) : NextResponse.json({ error: 'server' }, { status: 500 })
  }
}
