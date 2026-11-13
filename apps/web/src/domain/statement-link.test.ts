import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchStatementRows, type LinkOrder, type LinkRow } from './statement-link'

const row = (id: string, localDate: string, amount: number, description = 'FAKE SHOP', extra: Partial<LinkRow> = {}): LinkRow => ({ id, localDate, amount, currency: 'INR', description, ...extra })
const order = (id: string, localDate: string, amount: number, platform: string | null = 'swiggy', currency = 'INR'): LinkOrder => ({ id, localDate, amount, currency, platform })
const pairs = (r: LinkRow[], o: LinkOrder[]) => matchStatementRows(r, o).map((l) => `${l.rowId}>${l.orderId}`)

test('links the same amount at 0, 1 and 2 days, not at 3', () => {
  for (const [day, linked] of [['2024-03-10', true], ['2024-03-11', true], ['2024-03-12', true], ['2024-03-08', true], ['2024-03-13', false], ['2024-03-07', false]] as const) {
    assert.equal(pairs([row('r', day, -250)], [order('o', '2024-03-10', -250)]).length, linked ? 1 : 0, day)
  }
})

test('does not link across currencies, different amounts or credits', () => {
  assert.deepEqual(pairs([row('r', '2024-03-10', -250)], [order('o', '2024-03-10', -250, 'swiggy', 'USD')]), [])
  assert.deepEqual(pairs([row('r', '2024-03-10', -250.01)], [order('o', '2024-03-10', -250)]), [])
  assert.deepEqual(pairs([row('r', '2024-03-10', 250)], [order('o', '2024-03-10', 250)]), [])
  assert.deepEqual(pairs([row('r', '2024-03-10', 250)], [order('o', '2024-03-10', -250)]), [])
})

test('rounds to two decimals before comparing', () => {
  assert.deepEqual(pairs([row('r', '2024-03-10', -250.004)], [order('o', '2024-03-10', -250)]), ['r>o'])
})

test('one-to-one: two bank rows and one order link once, the closer day wins', () => {
  assert.deepEqual(pairs([row('a', '2024-03-12', -100), row('b', '2024-03-10', -100)], [order('o', '2024-03-10', -100)]), ['b>o'])
})

test('two equal orders and two equal bank rows pair up without sharing', () => {
  const got = pairs([row('r1', '2024-03-10', -100), row('r2', '2024-03-11', -100)], [order('o1', '2024-03-10', -100), order('o2', '2024-03-11', -100)])
  assert.deepEqual([...got].sort(), ['r1>o1', 'r2>o2'])
})

test('a rejected pair stays apart, and the row can take another order', () => {
  assert.deepEqual(pairs([row('r', '2024-03-10', -100, 'X', { rejected: ['o1'] })], [order('o1', '2024-03-10', -100)]), [])
  assert.deepEqual(pairs([row('r', '2024-03-10', -100, 'X', { rejected: ['o1'] })], [order('o1', '2024-03-10', -100), order('o2', '2024-03-11', -100)]), ['r>o2'])
})

test('the platform name in the description breaks a tie', () => {
  const rows = [row('r', '2024-03-10', -100, 'UPI SWIGGY ORDER')]
  assert.deepEqual(pairs(rows, [order('z', '2024-03-10', -100, 'zomato'), order('s', '2024-03-10', -100, 'swiggy')]), ['r>s'])
})

test('a tie on score goes to the bank date on or after the order date, then to the ids', () => {
  assert.deepEqual(pairs([row('r', '2024-03-10', -100)], [order('early', '2024-03-11', -100), order('late', '2024-03-09', -100)]), ['r>late'])
  assert.deepEqual(pairs([row('r', '2024-03-10', -100)], [order('b', '2024-03-10', -100), order('a', '2024-03-10', -100)]), ['r>a'])
})
