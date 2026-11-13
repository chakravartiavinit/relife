import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PER_DAY, occurrencesBetween, validateRRule } from './recurrence'

const day = '2026-11-13'

test('validateRRule keeps ordinary daily-or-slower rules and anchors them', () => {
  const daily = validateRRule('FREQ=DAILY;BYHOUR=7;BYMINUTE=0', day)
  assert.equal(daily, 'DTSTART:20261113T000000\nRRULE:FREQ=DAILY;BYHOUR=7;BYMINUTE=0')
  assert.ok(validateRRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=18;BYMINUTE=30', day))
  assert.ok(validateRRule('FREQ=MONTHLY;BYMONTHDAY=1', day))
  assert.ok(validateRRule('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=14', day))
  assert.ok(validateRRule('FREQ=DAILY;BYHOUR=8,12,20;BYMINUTE=0', day), 'three a day is fine')
  assert.equal(validateRRule('DTSTART:20260101T000000\nRRULE:FREQ=DAILY;BYHOUR=9', day), 'DTSTART:20260101T000000\nRRULE:FREQ=DAILY;BYHOUR=9', 'keeps its own start')
  // What comes back expands without throwing.
  const occ = occurrencesBetween(daily!, new Date('2026-11-13T00:00:00Z'), new Date('2026-11-16T00:00:00Z'), 'UTC')
  assert.equal(occ.length, 3)
})

test('validateRRule refuses fast, malformed and empty rules', () => {
  assert.equal(validateRRule('FREQ=MINUTELY;BYHOUR=7', day), null, 'would ring every minute')
  assert.equal(validateRRule('FREQ=SECONDLY', day), null)
  assert.equal(validateRRule('FREQ=HOURLY', day), null)
  assert.equal(validateRRule('FREQ=EVERYDAY', day), null)
  assert.equal(validateRRule('FREQ=WEEKLY;BYDAY=XX', day), null)
  assert.equal(validateRRule('', day), null)
  assert.equal(validateRRule('not a rule', day), null)
  assert.equal(validateRRule('x'.repeat(700), day), null)
  assert.equal(validateRRule('FREQ=DAILY;BYHOUR=0,1,2,3,4,5,6,7', day), null, `more than ${MAX_PER_DAY} a day`)
  assert.equal(validateRRule('FREQ=DAILY;BYHOUR=8,9,10;BYMINUTE=0,15,30,45', day), null, 'hour × minute cross product')
  assert.equal(validateRRule('FREQ=DAILY;UNTIL=20200101T000000', day), null, 'nothing left to remind')
  assert.equal(validateRRule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30', day), null, 'a date that never happens')
  assert.equal(validateRRule('FREQ=DAILY\nEXDATE:20261114T000000', day), null)
})
