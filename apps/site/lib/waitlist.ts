import { and, count, eq, gt, lt, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db'
import { waitlistAttempts, waitlistSignups as t, type Signup } from '@/db/schema'
import { alreadyConfirmedEmail, confirmEmail, welcomeEmail } from '@/emails/templates'
import { CONSENT_VERSION, REFERRAL_CAP, SPOTS_PER_REFERRAL } from './config'
import { hashToken, hmac, newRefCode, newToken } from './crypto'
import { isDisposable } from './disposable'
import { emailDriver } from './email'
import { logError } from './log'
import { isSelfReferral } from './referral'
import { EMAIL_LIMITS, IP_LIMITS, ipGroup, isLimited } from './rate-limit'
import type { JoinInput } from './validation'

const DAY = 24 * 60 * 60_000
export type JoinResult = 'sent' | 'rate_limited' | 'disposable'

const attemptTimes = async (where: SQL) =>
  (await db().select({ at: waitlistAttempts.at }).from(waitlistAttempts).where(and(where, gt(waitlistAttempts.at, new Date(Date.now() - DAY))))).map((r) => r.at.getTime())

/** The one write path for the signup form. Returns what to tell the visitor; the email is always "check your inbox". */
export async function joinWaitlist(input: JoinInput, ip: string): Promise<JoinResult> {
  const ipHash = hmac(ipGroup(ip))
  if (isLimited(await attemptTimes(and(eq(waitlistAttempts.ipHash, ipHash), eq(waitlistAttempts.kind, 'submit'))!), IP_LIMITS)) return 'rate_limited'
  await db().insert(waitlistAttempts).values({ ipHash, kind: 'submit' })
  if (isDisposable(input.email)) return 'disposable'

  const emailHash = hmac(input.email)
  const [existing] = await db().select().from(t).where(eq(t.email, input.email))
  // Over the per-email send limit: look the same as success, send nothing (no enumeration, no mail bombing).
  if (existing && isLimited(await attemptTimes(eq(waitlistAttempts.emailHash, emailHash)), EMAIL_LIMITS)) return 'sent'

  // A confirmed member's link is the one in their welcome mail. Issuing a new token here would kill it, and anyone
  // can type someone else's address, so for confirmed rows nothing is rotated: they just get a mail without a link.
  if (existing?.status === 'confirmed') {
    await db().insert(waitlistAttempts).values({ ipHash, emailHash, kind: 'send' })
    await emailDriver().send(alreadyConfirmedEmail(existing.email, existing.refCode))
    return 'sent'
  }

  const token = newToken()
  let row: Signup
  if (existing) {
    // A re-submit of a pending address only rotates the link. It never touches who referred the row (set once, at creation) and it keeps
    // chips someone already chose, so typing another person's pending address can't change their signup.
    // The rotation is one conditional UPDATE: only one request per 2 minutes gets to issue a link, so parallel
    // submits can't each email a token and leave one of them dead.
    const [rotated] = await db().update(t).set({
      tokenHash: hashToken(token),
      tokenIssuedAt: new Date(),
      ...(existing.interests.length ? {} : { interests: input.interests }),
      ...(existing.platforms.length ? {} : { platforms: input.platforms }),
    }).where(and(eq(t.id, existing.id), sql`${t.tokenIssuedAt} < now() - ${EMAIL_LIMITS[0].windowMs}::float8 * interval '1 millisecond'`)).returning()
    if (!rotated) return 'sent'
    row = rotated
  } else {
    const created = await insertSignup(input, token, ipHash, await resolveReferrer(input, ipHash))
    // Lost a race with a parallel submit of the same address: that request saved its own token and sends the
    // email. Sending ours would mail a link whose hash was never stored.
    if (!created) return 'sent'
    row = created
  }
  await db().insert(waitlistAttempts).values({ ipHash, emailHash, kind: 'send' })
  await emailDriver().send(confirmEmail(row.email, token))
  return 'sent'
}

/** The new row, or null when another request inserted the same email first. */
async function insertSignup(input: JoinInput, token: string, ipHash: string, referredBy: string | null): Promise<Signup | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db().insert(t).values({
        email: input.email, tokenHash: hashToken(token), refCode: newRefCode(), referredBy,
        interests: input.interests, platforms: input.platforms, source: input.source ?? null, utm: input.utm ?? null,
        consentVersion: CONSENT_VERSION, ipHash,
      }).returning()
      return row
    } catch (e) {
      // Unique email lost a race: the other request owns the row. A ref_code collision (no row for this email) retries.
      const [again] = await db().select({ id: t.id }).from(t).where(eq(t.email, input.email))
      if (again) return null
      if (i === 4) throw e
    }
  }
  throw new Error('unreachable')
}

/** Who gets credit for this signup, or null. See isSelfReferral for what is refused. */
async function resolveReferrer(input: JoinInput, ipHash: string): Promise<string | null> {
  if (!input.ref) return null
  const [r] = await db().select({ id: t.id, email: t.email, ipHash: t.ipHash }).from(t).where(eq(t.refCode, input.ref))
  if (!r || isSelfReferral({ referrerEmail: r.email, referrerIpHash: r.ipHash, email: input.email, ipHash })) return null
  return r.id
}

/** A referrer's credit is the number of their confirmed friends (capped), recomputed so it can't drift. */
const recount = (referrerId: string) =>
  db().update(t).set({
    referralCount: sql`least((select count(*)::int from ${t} f where f.referred_by = ${referrerId} and f.status = 'confirmed'), ${REFERRAL_CAP})`,
  }).where(eq(t.id, referrerId))

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
    sql`(${t.seq} - ${SPOTS_PER_REFERRAL} * ${t.referralCount}, ${t.seq}) < (${me.seq - SPOTS_PER_REFERRAL * me.referralCount}::bigint, ${me.seq}::bigint)`,
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
      if (done.referredBy) await recount(done.referredBy)
      await emailDriver().send(welcomeEmail(done.email, token, done.refCode)).catch((e) => logError('welcome email failed', e))
    }
  }
  return statusFor(token)
}

/** Deletes the row. A confirmed friend who leaves takes their referral credit with them, so leave + rejoin can't pay twice. */
export async function leaveWaitlist(token: string): Promise<boolean> {
  const [gone] = await db().delete(t).where(eq(t.tokenHash, hashToken(token))).returning({ referredBy: t.referredBy, status: t.status })
  if (gone?.referredBy && gone.status === 'confirmed') await recount(gone.referredBy)
  return !!gone
}

/** Daily cron: pending rows whose last confirm link is 7 days old and old rate-limit rows (24 h). */
export async function cleanup() {
  const pending = await db().delete(t).where(and(eq(t.status, 'pending'), lt(t.tokenIssuedAt, new Date(Date.now() - 7 * DAY)))).returning({ id: t.id })
  const attempts = await db().delete(waitlistAttempts).where(lt(waitlistAttempts.at, new Date(Date.now() - DAY))).returning({ id: waitlistAttempts.id })
  return { pending: pending.length, attempts: attempts.length }
}
