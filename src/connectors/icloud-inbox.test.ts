import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkInbox, consumable, lineToRawEvent } from './icloud-inbox'

/** A fake home folder, so the real iCloud Drive on a dev's Mac doesn't change the answer. */
function fakeHome() {
  const home = mkdtempSync('/var/tmp/relife-inbox-')
  const old = process.env.HOME
  process.env.HOME = home
  return { home, restore: () => { process.env.HOME = old } }
}

test('check: no iCloud folder blocks with advice; a folder or a file passes', () => {
  const h = fakeHome()
  try {
    assert.throws(() => checkInbox(), /iCloud Drive/)
    assert.throws(() => checkInbox(join(h.home, 'nowhere/at/all/inbox.txt')), /Couldn’t find/)
    const dir = join(h.home, 'Library/Mobile Documents/com~apple~CloudDocs/relife')
    mkdirSync(dir, { recursive: true })
    checkInbox() // folder is there, the first Shortcut run makes the file
    writeFileSync(join(dir, 'inbox.txt'), '')
    checkInbox()
  } finally { h.restore() }
})

test('check: Inbox file set to a folder says so when nothing else is found', () => {
  const h = fakeHome()
  try {
    const folder = join(h.home, 'docs')
    mkdirSync(folder)
    assert.throws(() => checkInbox(folder), /is a folder/)
  } finally { h.restore() }
})

test('a line without a date is today’s: the same line on another day is not a repeat', () => {
  const line = '{"type":"health","metric":"weight","value":71.4,"unit":"kg"}'
  const a = lineToRawEvent(line, new Date('2026-11-05T08:00:00Z'))!
  const b = lineToRawEvent(line, new Date('2026-11-06T08:00:00Z'))!
  const c = lineToRawEvent(line, new Date('2026-11-05T20:00:00Z'))!
  assert.notEqual(a.externalId, b.externalId)
  assert.equal(a.externalId, c.externalId)
})

test('a dated line keeps one id wherever and whenever it is read', () => {
  const line = '{"type":"steps","value":8423,"date":"2026-11-05"}'
  assert.equal(lineToRawEvent(line, new Date('2026-11-05T08:00:00Z'))!.externalId, lineToRawEvent(line, new Date('2026-11-09T08:00:00Z'))!.externalId)
})

test('malformed and unknown lines are skipped', () => {
  const now = new Date()
  for (const l of ['', '   ', 'plain text', '{"type":"steps"', '{"type":"sms","body":"x"}', '{"type":"sleep","event":"nap"}']) assert.equal(lineToRawEvent(l, now), null)
})

test('consumable waits for a half-written last line and takes a complete one without a line break', () => {
  assert.equal(consumable(Buffer.from('{"a":1}\n{"type":"ste')), 8)
  const whole = Buffer.from('{"a":1}\n{"type":"steps","value":3}')
  assert.equal(consumable(whole), whole.length)
})
