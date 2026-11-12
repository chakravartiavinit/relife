import { and, count, eq, gt, lt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { waitlistAttempts, waitlistSignups as t, type Signup } from '@/db/schema'
import { alreadyConfirmedEmail, confirmEmail, welcomeEmail } from '@/emails/templates'
import { CONSENT_VERSION, REFERRAL_CAP, SPOTS_PER_REFERRAL } from './config'
import { hashToken, hmac, newRefCode, newToken } from './crypto'
import { isDisposable } from './disposable'
import { emailDriver } from './email'
import { EMAIL_LIMITS, IP_LIMITS, isLimited } from './rate-limit'
import type { JoinInput } from './validation'

const DAY = 24 * 60 * 60_000
export type JoinResult = 'sent' | 'rate_limited' | 'disposable'

const attemptTimes = async (where: ReturnType<typeof eq>) =>
  (await db().select({ at: waitlistAttempts.at }).from(waitlistAttempts).where(and(where, gt(waitlistAttempts.at, new Date(Date.now() - DAY))))).map((r) => r.at.getTime())

/** The one write path for the signup form. Returns what to tell the visitor; the email is always "check your inbox". */
export async function joinWaitlist(input: JoinInput, ip: string): Promise<JoinResult> {
  const ipHash = hmac(ip)
  if (isLimited(await attemptTimes(eq(waitlistAttempts.ipHash, ipHash)), IP_LIMITS)) return 'rate_limited'
  await db().insert(waitlistAttempts).values({ ipHash, kind: 'submit' })
  if (isDisposable(input.email)) return 'disposable'

  const emailHash = hmac(input.email)
  const [existing] = await db().select().from(t).where(eq(t.email, input.email))
  // Over the per-email send limit: look the same as success, send nothing (no enumeration, no mail bombing).
  if (existing && isLimited(await attemptTimes(eq(waitlistAttempts.emailHash, emailHash)), EMAIL_LIMITS)) return 'sent'

  const token = newToken()
  const referredBy = await resolveReferrer(input.ref, ipHash)
  let row: Signup
  if (existing) {
    ;[row] = await db().update(t).set({
      tokenHash: hashToken(token),
      referredBy: existing.referredBy ?? referredBy,
      ...(input.interests.length ? { interests: input.interests } : {}),
      ...(input.platforms.length ? { platforms: input.platforms } : {}),
    }).where(eq(t.id, existing.id)).returning()
  } else {
    row = await insertSignup(input, token, ipHash, referredBy)
  }
  await db().insert(waitlistAttempts).values({ ipHash, emailHash, kind: 'send' })
  await emailDriver().send(row.status === 'confirmed' ? alreadyConfirmedEmail(row.email, token) : confirmEmail(row.email, token))
  return 'sent'
}

async function insertSignup(input: JoinInput, token: string, ipHash: string, referredBy: string | null): Promise<Signup> {
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db().insert(t).values({
        email: input.email, tokenHash: hashToken(token), refCode: newRefCode(), referredBy,
        interests: input.interests, platforms: input.platforms, source: input.source ?? null, utm: input.utm ?? null,
        consentVersion: CONSENT_VERSION, ipHash,
      }).returning()
      return row
    } catch (e) {
      // A double submit races on the unique email: treat it as the existing row. A ref_code collision retries.
      const [again] = await db().select().from(t).where(eq(t.email, input.email))
      if (again) return again
      if (i === 4) throw e
    }
  }
  throw new Error('unreachable')
}

/** No self-referral: same IP hash as a referrer who signed up in the last day gets no link. */
async function resolveReferrer(ref: string | undefined, ipHash: string): Promise<string | null> {
  if (!ref) return null
  const [r] = await db().select({ id: t.id, ipHash: t.ipHash, createdAt: t.createdAt }).from(t).where(eq(t.refCode, ref))
  if (!r) return null
  if (r.ipHash === ipHash && Date.now() - r.createdAt.getTime() < DAY) return null
  return r.id
}

const byToken = async (token: string) => (await db().select().from(t).where(eq(t.tokenHash, hashToken(token))))[0]

export type Status = {
  status: 'pending' | 'confirmed'
  position: number | null
  ahead: number | null
  refCode: string
  referralCount: number
  email: string
}

/** 1 + confirmed rows with a lower score (seq - 10 x referrals), ties by seq. Same rule as position.ts. */
async function positionIn(me: Signup): Promise<number> {
  const [{ n }] = await db().select({ n: count() }).from(t).where(and(
    eq(t.status, 'confirmed'),
    sql`(${t.seq} - ${SPOTS_PER_REFERRAL} * ${t.referralCount}, ${t.seq}) < (${me.seq - SPOTS_PER_REFERRAL * me.referralCount}, ${me.seq})`,
  ))
  return 1 + n
}

export async function statusFor(token: string): Promise<Status | null> {
  const me = await byToken(token)
  if (!me) return null
  const position = me.status === 'confirmed' ? await positionIn(me) : null
  return { status: me.status, position, ahead: position === null ? null : position - 1, refCode: me.refCode, referralCount: me.referralCount, email: me.email }
}

/** Idempotent. The first confirm credits the referrer once and sends the welcome mail. */
export async function confirmToken(token: string): Promise<Status | null> {
  const me = await byToken(token)
  if (!me) return null
  if (me.status === 'pending') {
    const [done] = await db().update(t).set({ status: 'confirmed', confirmedAt: new Date() }).where(and(eq(t.id, me.id), eq(t.status, 'pending'))).returning()
    if (done) {
      if (done.referredBy) {
        await db().update(t).set({ referralCount: sql`least(${t.referralCount} + 1, ${REFERRAL_CAP})` }).where(eq(t.id, done.referredBy))
      }
      await emailDriver().send(welcomeEmail(done.email, token, done.refCode)).catch((e) => console.error('welcome email failed', e))
    }
  }
  return statusFor(token)
}

export async function leaveWaitlist(token: string): Promise<boolean> {
  const rows = await db().delete(t).where(eq(t.tokenHash, hashToken(token))).returning({ id: t.id })
  return rows.length > 0
}

/** Daily cron: stale pending rows (7 days) and old rate-limit rows (24 h). */
export async function cleanup() {
  const pending = await db().delete(t).where(and(eq(t.status, 'pending'), lt(t.createdAt, new Date(Date.now() - 7 * DAY)))).returning({ id: t.id })
  const attempts = await db().delete(waitlistAttempts).where(lt(waitlistAttempts.at, new Date(Date.now() - DAY))).returning({ id: waitlistAttempts.id })
  return { pending: pending.length, attempts: attempts.length }
}
