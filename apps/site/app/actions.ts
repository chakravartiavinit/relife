'use server'

import { headers } from 'next/headers'
import { joinWaitlist } from '@/lib/waitlist'
import { joinSchema, readJoinForm } from '@/lib/validation'

export type JoinState = {
  status: 'idle' | 'done' | 'invalid' | 'disposable' | 'rate_limited' | 'error'
  email?: string
}

async function clientIp() {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

/** Optional escalation: Cloudflare Turnstile, only when TURNSTILE_SECRET_KEY is set. */
async function turnstileOk(fd: FormData, ip: string) {
  const key = process.env.TURNSTILE_SECRET_KEY
  if (!key) return true
  const token = fd.get('cf-turnstile-response')
  if (typeof token !== 'string' || !token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: key, response: token, remoteip: ip }) })
  return res.ok && (await res.json()).success === true
}

export async function joinAction(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const parsed = joinSchema.safeParse(readJoinForm(fd))
  if (!parsed.success) return { status: 'invalid', email: String(fd.get('email') ?? '') }
  const { email } = parsed.data
  // Honeypot: look like success, store nothing.
  if (fd.get('company')) return { status: 'done', email }
  try {
    const ip = await clientIp()
    if (!(await turnstileOk(fd, ip))) return { status: 'error', email }
    const result = await joinWaitlist(parsed.data, ip)
    return result === 'sent' ? { status: 'done', email } : { status: result, email }
  } catch (e) {
    console.error('joinWaitlist failed', e)
    return { status: 'error', email }
  }
}
