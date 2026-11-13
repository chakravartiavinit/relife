import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashToken, hmac, newRefCode, newToken } from './crypto'
import { isDisposable } from './disposable'
import { positionOf, scoreOf } from './position'
import { EMAIL_LIMITS, IP_LIMITS, isLimited } from './rate-limit'
import { joinSchema, readJoinForm } from './validation'

test('position: join order, and a referral moves you up to 10 places', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ seq: i + 1, referralCount: 0 }))
  assert.equal(positionOf(rows[0], rows), 1)
  assert.equal(positionOf(rows[29], rows), 30)
  rows[29].referralCount = 1 // seq 30 - 10 = score 20, level with seq 20: the earlier seq keeps the tie
  assert.equal(scoreOf(rows[29]), 20)
  assert.equal(positionOf(rows[29], rows), 21)
  assert.equal(positionOf(rows[19], rows), 20)
  rows[29].referralCount = 2 // score 10, level with seq 10
  assert.equal(positionOf(rows[29], rows), 11)
  rows[29].referralCount = 3 // score 0: clear of everyone
  assert.equal(positionOf(rows[29], rows), 1)
})

test('position: ties go to the earlier seq', () => {
  const a = { seq: 20, referralCount: 0 }
  const b = { seq: 30, referralCount: 1 }
  assert.equal(scoreOf(a), scoreOf(b))
  assert.equal(positionOf(a, [a, b]), 1)
  assert.equal(positionOf(b, [a, b]), 2)
})

test('tokens: hash is stable, tokens are unique and url-safe, ref codes are 8 chars without 0/O/1/I', () => {
  const t = newToken()
  assert.equal(hashToken(t), hashToken(t))
  assert.notEqual(hashToken(t), t)
  assert.notEqual(newToken(), t)
  assert.match(t, /^[A-Za-z0-9_-]{43}$/)
  for (let i = 0; i < 200; i++) assert.match(newRefCode(), /^[A-HJ-NP-Z2-9]{8}$/)
  assert.notEqual(hmac('1.2.3.4', 'a'), hmac('1.2.3.4', 'b'))
})

test('rate limiter: per-IP 5 per 10 minutes and 20 per day', () => {
  const now = 1_000_000_000
  const min = 60_000
  assert.equal(isLimited([], IP_LIMITS, now), false)
  assert.equal(isLimited([1, 2, 3, 4].map((i) => now - i * min), IP_LIMITS, now), false)
  assert.equal(isLimited([1, 2, 3, 4, 5].map((i) => now - i * min), IP_LIMITS, now), true)
  // The same five spread past the 10-minute window are fine.
  assert.equal(isLimited([11, 12, 13, 14, 15].map((i) => now - i * min), IP_LIMITS, now), false)
  // 20 in the day trips the daily window even when none are recent.
  assert.equal(isLimited(Array.from({ length: 20 }, (_, i) => now - (60 + i * 30) * min), IP_LIMITS, now), true)
})

test('rate limiter: per-email one send per 2 minutes, 5 per day', () => {
  const now = 1_000_000_000
  assert.equal(isLimited([now - 60_000], EMAIL_LIMITS, now), true)
  assert.equal(isLimited([now - 121_000], EMAIL_LIMITS, now), false)
  assert.equal(isLimited([1, 2, 3, 4, 5].map((i) => now - i * 3 * 60_000 * 10), EMAIL_LIMITS, now), true)
})

test('disposable domains, including subdomains', () => {
  assert.equal(isDisposable('a@mailinator.com'), true)
  assert.equal(isDisposable('a@x.MAILINATOR.com'), true)
  assert.equal(isDisposable('a@gmail.com'), false)
})

test('join schema: trims and lowercases, drops unknown chips, rejects bad emails', () => {
  const fd = new FormData()
  fd.set('email', '  Name@Example.COM ')
  fd.append('interests', 'health'); fd.append('interests', 'health'); fd.append('interests', 'bogus')
  fd.append('platforms', 'mac')
  fd.set('ref', 'k7fq2m9x')
  fd.set('utm_source', 'x')
  const ok = joinSchema.parse(readJoinForm(fd))
  assert.equal(ok.email, 'name@example.com')
  assert.deepEqual(ok.interests, ['health'])
  assert.deepEqual(ok.platforms, ['mac'])
  assert.equal(ok.ref, 'K7FQ2M9X')
  assert.deepEqual(ok.utm, { utm_source: 'x' })
  assert.equal(joinSchema.safeParse({ email: 'nope', interests: [], platforms: [] }).success, false)
  assert.equal(joinSchema.parse({ email: 'a@b.co', interests: [], platforms: [], ref: 'bad ref!' }).ref, undefined)
})
