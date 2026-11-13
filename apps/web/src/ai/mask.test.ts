import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mask, maskValue } from './mask'

delete process.env.LLM_MASK

test('long account and phone numbers are masked, amounts are not', () => {
  assert.equal(mask('A/c 123456789012 debited'), 'A/c XXXX9012 debited')
  assert.equal(mask('call 9876543210'), 'call XXXX3210')
  assert.equal(mask('paid 10000000 and 1234567 and 1234.5678'), 'paid 10000000 and 1234567 and 1234.5678')
  assert.equal(mask('A/c No.012345678901 is debited'), 'A/c No.XXXX8901 is debited')
  assert.equal(mask('A/c:123456789012, debited'), 'A/c:XXXX9012, debited')
})

test('a bare JSON number is a value, a string of digits is an identifier', () => {
  assert.equal(mask('{"netWorth":100000000,"total":12345678901.5}', true), '{"netWorth":100000000,"total":12345678901.5}')
  assert.equal(mask('{"acct":"123456789012"}'), '{"acct":"XXXX9012"}')
  assert.deepEqual(maskValue({ n: 100000000, upi: 'ravikumar@okhdfc' }), { n: 100000000, upi: 'ra…@okhdfc' })
})

test('ids glued to letters are left alone', () => {
  assert.equal(mask('Order OD123456789012345678'), 'Order OD123456789012345678')
})

test('LLM_MASK=false turns it off', () => {
  process.env.LLM_MASK = 'false'
  assert.equal(mask('A/c 123456789012 x@upi'), 'A/c 123456789012 x@upi')
  delete process.env.LLM_MASK
})
