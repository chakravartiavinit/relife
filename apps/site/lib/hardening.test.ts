import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { scrubAnalyticsEvent } from './analytics'
import { emailDriver } from './email'
import { emailKey } from './email-key'
import { describeError } from './log'
import { isSelfReferral } from './referral'
import { secret } from './crypto'

const ENV_KEYS = ['NODE_ENV', 'EMAIL_DRIVER', 'VERCEL', 'SITE_ALLOW_UNREADY_BRAND', 'WAITLIST_SECRET'] as const
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
const env = process.env as Record<string, string | undefined>
const setEnv = (e: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) => {
  for (const k of ENV_KEYS) delete env[k]
  for (const [k, v] of Object.entries(e)) if (v !== undefined) env[k] = v
}
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k] } })

test('analytics: /w/<token> is reported as /w/[token], nothing else changes', () => {
  const secretUrl = 'https://relife.example/w/abc123_secret-token?left=1#x'
  assert.deepEqual(scrubAnalyticsEvent({ type: 'pageview', url: secretUrl }), { type: 'pageview', url: 'https://relife.example/w/[token]' })
  assert.equal(scrubAnalyticsEvent({ type: 'pageview', url: 'https://relife.example/w/abc' }).url.includes('abc'), false)
  const home = { type: 'pageview', url: 'https://relife.example/?ref=ABCD2345' } as const
  assert.deepEqual(scrubAnalyticsEvent(home), home)
  assert.equal(scrubAnalyticsEvent({ type: 'event', url: '/w/secret' }).url, '/w/[token]')
})

test('email key: +tags, gmail dots and googlemail collapse; other domains keep their dots', () => {
  assert.equal(emailKey('Alice+test@Example.com'), 'alice@example.com')
  assert.equal(emailKey('a.l.i.c.e+x@gmail.com'), 'alice@gmail.com')
  assert.equal(emailKey('alice@googlemail.com'), 'alice@gmail.com')
  assert.equal(emailKey('a.lice@example.com'), 'a.lice@example.com')
  assert.notEqual(emailKey('alice@example.com'), emailKey('bob@example.com'))
})

test('self-referral: same mailbox alias or same IP is refused, however old the referrer is', () => {
  const base = { referrerEmail: 'alice@gmail.com', referrerIpHash: 'ip-a', email: 'bob@example.com', ipHash: 'ip-b' }
  assert.equal(isSelfReferral(base), false)
  assert.equal(isSelfReferral({ ...base, email: 'al.ice+farm1@googlemail.com' }), true)
  assert.equal(isSelfReferral({ ...base, ipHash: 'ip-a' }), true)
  assert.equal(isSelfReferral({ ...base, referrerIpHash: null }), false)
})

test('errors are logged without emails, params or tokens', () => {
  const token = 'x'.repeat(43)
  const drizzle = new Error(`Failed query: insert into "waitlist_signups" values ($1)\nparams: victim@example.com,${'a'.repeat(64)}`)
  ;(drizzle as { cause?: unknown }).cause = Object.assign(new Error('duplicate key'), { code: '23505', constraint_name: 'waitlist_signups_email_unique', detail: 'Key (email)=(victim@example.com) already exists.' })
  const text = describeError(drizzle)
  assert.match(text, /23505 waitlist_signups_email_unique/)
  assert.doesNotMatch(text, /victim|aaaaaaaa/)
  const loose = describeError(new Error(`resend said victim@example.com is bad, link /w/${token}`))
  assert.doesNotMatch(loose, /victim|xxxxxxxx/)
  assert.match(loose, /\[email\]/)
})

test('email driver: no default in production, console only in dev or a local preview, never on Vercel', () => {
  setEnv({ NODE_ENV: 'development' })
  assert.doesNotThrow(() => emailDriver()) // console by default in dev
  setEnv({ NODE_ENV: 'production' })
  assert.throws(() => emailDriver(), /EMAIL_DRIVER is not set/)
  setEnv({ NODE_ENV: 'production', EMAIL_DRIVER: 'console' })
  assert.throws(() => emailDriver(), /live confirmation links/)
  setEnv({ NODE_ENV: 'production', EMAIL_DRIVER: 'console', SITE_ALLOW_UNREADY_BRAND: '1', VERCEL: '1' })
  assert.throws(() => emailDriver(), /live confirmation links/)
  setEnv({ NODE_ENV: 'production', EMAIL_DRIVER: 'console', SITE_ALLOW_UNREADY_BRAND: '1' })
  assert.doesNotThrow(() => emailDriver()) // local preview build
  setEnv({ NODE_ENV: 'production', EMAIL_DRIVER: 'resend' })
  assert.doesNotThrow(() => emailDriver())
})

test('WAITLIST_SECRET is required in production even for a local preview build', () => {
  setEnv({ NODE_ENV: 'production', SITE_ALLOW_UNREADY_BRAND: '1' })
  assert.throws(() => secret(), /WAITLIST_SECRET is not set/)
  setEnv({ NODE_ENV: 'production', WAITLIST_SECRET: 'k' })
  assert.equal(secret(), 'k')
  setEnv({ NODE_ENV: 'development' })
  assert.equal(typeof secret(), 'string')
})
