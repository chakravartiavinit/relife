import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkInbox, consumable, icloudInbox, lineToRawEvent } from './icloud-inbox'
import { setKeys } from '@/core/env'
import type { ConnectorCtx, RawEvent } from '@/core/types'

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

test('a line without a date is keyed by the local day, not the UTC day', () => {
  const line = '{"type":"health","metric":"weight","value":71.4,"unit":"kg"}'
  // 23:00 and 01:00 in India are different local days but the same UTC day.
  const late = lineToRawEvent(line, new Date('2026-11-05T17:30:00Z'), 'Asia/Kolkata')!
  const early = lineToRawEvent(line, new Date('2026-11-05T19:30:00Z'), 'Asia/Kolkata')!
  assert.notEqual(late.externalId, early.externalId)
})

test('a re-saved copy of the inbox (new inode, same start) is not read again; a changed file is', async () => {
  const dir = mkdtempSync('/var/tmp/relife-inbox-sync-')
  const file = join(dir, 'inbox.txt')
  setKeys(new Map([['ICLOUD_INBOX_PATH', file]]))
  let cursor: unknown = null
  const run = async () => {
    const events: RawEvent[] = []
    const ctx = { user: { timezone: 'Asia/Kolkata' }, cursor, setCursor: (c: unknown) => { cursor = c }, emit: async (e: RawEvent) => { events.push(e) }, log: () => {} } as unknown as ConnectorCtx
    await icloudInbox.sync(ctx)
    return events
  }
  try {
    const weight = '{"type":"health","metric":"weight","value":71.4,"unit":"kg"}\n'
    writeFileSync(file, weight)
    assert.equal((await run()).length, 1)
    // iCloud replaces the file with a newer copy: same old line, one new line.
    writeFileSync(join(dir, 'copy.txt'), weight + '{"type":"steps","value":900,"date":"2026-11-06"}\n')
    renameSync(join(dir, 'copy.txt'), file)
    const second = await run()
    assert.deepEqual(second.map((e) => (e.body as { type: string }).type), ['steps'])
    appendFileSync(file, '{"type":"steps","value":1000,"date":"2026-11-07"}\n')
    assert.equal((await run()).length, 1)
    // Cleared and started again: the new content is read from the start.
    writeFileSync(join(dir, 'copy.txt'), '{"type":"health","metric":"weight","value":70.9,"unit":"kg"}\n')
    renameSync(join(dir, 'copy.txt'), file)
    assert.equal((await run()).length, 1)
  } finally { setKeys(new Map()) }
})
