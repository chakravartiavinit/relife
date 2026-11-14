import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backupName, isoWeek, parseBackupName, pickExpired } from './backups'

const day = (iso: string, o: { pre?: boolean; enc?: boolean } = {}) =>
  backupName(`${iso}T0330`, { reason: o.pre ? 'pre-restore' : 'daily', encrypted: !!o.enc })
/** `n` daily backups ending on 2026-11-13, one a day. */
const run = (n: number) => Array.from({ length: n }, (_, i) => day(new Date(Date.UTC(2026, 10, 13 - i)).toISOString().slice(0, 10)))

test('names round trip, and other files are not ours', () => {
  assert.equal(day('2026-11-13'), 'relife-backup-2026-11-13T0330.tar.gz')
  assert.equal(day('2026-11-13', { enc: true }), 'relife-backup-2026-11-13T0330.tar.gz.enc')
  assert.deepEqual(parseBackupName('relife-backup-2026-11-13T0330-pre-restore.tar.gz.enc'),
    { name: 'relife-backup-2026-11-13T0330-pre-restore.tar.gz.enc', at: new Date('2026-11-13T03:30:00Z'), preRestore: true, encrypted: true })
  for (const bad of ['notes.txt', 'relife-backup-2026-11-13T0330.tar.gz.partial', 'relife-backup-2026-02-31T0330.tar.gz', 'relife-export-2026-11-13.zip']) {
    assert.equal(parseBackupName(bad), null, bad)
  }
})

test('names carry seconds, and older minute-only names still parse', () => {
  assert.equal(backupName('2026-11-13T033005', { reason: 'manual', encrypted: false }), 'relife-backup-2026-11-13T033005.tar.gz')
  assert.deepEqual(parseBackupName('relife-backup-2026-11-13T033005-pre-restore.tar.gz'),
    { name: 'relife-backup-2026-11-13T033005-pre-restore.tar.gz', at: new Date('2026-11-13T03:30:05Z'), preRestore: true, encrypted: false })
  assert.equal(parseBackupName('relife-backup-2026-11-13T0330.tar.gz')?.at.toISOString(), '2026-11-13T03:30:00.000Z')
  assert.equal(parseBackupName('relife-backup-2026-11-13T03305.tar.gz'), null)
  // two backups in one minute are two files, and the later one sorts first
  const two = ['relife-backup-2026-11-13T033001.tar.gz', 'relife-backup-2026-11-13T033042.tar.gz']
  assert.deepEqual(pickExpired(two, { daily: 1, weekly: 0 }), [two[0]])
})

test('ISO weeks cross the year', () => {
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01')
  assert.equal(isoWeek(new Date('2025-12-29T00:00:00Z')), '2026-W01')
  assert.equal(isoWeek(new Date('2027-01-03T00:00:00Z')), '2026-W53')
  assert.equal(isoWeek(new Date('2026-11-13T00:00:00Z')), '2026-W46')
})

test('seven or fewer backups are all kept', () => {
  assert.deepEqual(pickExpired(run(7), { daily: 7, weekly: 4 }), [])
  assert.deepEqual(pickExpired([], { daily: 7, weekly: 4 }), [])
})

test('keeps the newest 7 plus the newest of 4 earlier weeks', () => {
  // 40 days: 11-13 back to 10-05
  const expired = new Set(pickExpired(run(40), { daily: 7, weekly: 4 }))
  const kept = run(40).filter((n) => !expired.has(n))
  assert.equal(kept.length, 11)
  assert.deepEqual(kept.slice(0, 7), run(7)) // the newest 7
  // 11-13 is a Friday: the daily seven cover 11-07 (Sat of W45) .. 11-13 (W46). Weekly picks are the newest of W45? W45 already
  // has a kept daily file (11-07), so the first weekly pick is the newest file of W44, 11-01 (Sunday).
  assert.deepEqual(kept.slice(7).map((n) => n.slice(14, 24)), ['2026-11-01', '2026-10-25', '2026-10-18', '2026-10-11'])
})

test('pre-restore backups and foreign files are never deleted', () => {
  const names = [...run(10), day('2026-01-01', { pre: true }), 'notes.txt']
  const expired = pickExpired(names, { daily: 7, weekly: 0 })
  assert.deepEqual(expired, run(10).slice(7))
})

test('encrypted and plain backups of one day count separately, newest first', () => {
  const names = [day('2026-11-13'), day('2026-11-13', { enc: true }), day('2026-11-12')]
  assert.equal(pickExpired(names, { daily: 2, weekly: 0 }).length, 1)
})

test('daily 0 means backups are off: nothing is deleted', () => {
  assert.deepEqual(pickExpired(run(30), { daily: 0, weekly: 4 }), [])
})
