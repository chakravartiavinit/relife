import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupOf, reasonFor, summarize } from './inbox'

test('groupOf separates real failures from ones that sort themselves out', () => {
  assert.equal(groupOf('failed', 'No matching payment yet'), 'waiting')
  assert.equal(groupOf('failed', 'Order not saved yet'), 'waiting')
  assert.equal(groupOf('failed', 'Unknown bank format'), 'needs')
  assert.equal(groupOf('ignored', null), 'skipped')
  assert.equal(groupOf('failed', 'Order not saved yet', true), 'skipped')
  assert.match(reasonFor('failed', 'Order not saved yet', true), /^Its order was dismissed/)
  assert.match(reasonFor('failed', 'No matching payment yet'), /^Waiting for the matching bank payment/)
  assert.equal(reasonFor('ignored', null), 'No reader recognised this message.')
})

test('summarize turns item JSON into an order line with names and a total', () => {
  const s = summarize('zepto-items', { platform: 'zepto', orderId: 'Z1', items: [
    { qty: 4, name: 'Tender Coconut', price: 345.76 }, { qty: 1, name: 'Oreo', price: 34.36 },
    { qty: 1, name: 'Milk', price: 30 }, { qty: 2, name: 'Bread', price: 80 },
  ] })
  assert.equal(s.app, 'zepto')
  assert.equal(s.title, 'Zepto item list · 4 items')
  assert.deepEqual(s.items, ['4 × Tender Coconut', 'Oreo', 'Milk'])
  assert.equal(s.more, 1)
  assert.equal(Math.round(s.amount!.value * 100), 49012)
})

test('summarize uses the order name and total, and plain text for messages', () => {
  const o = summarize('blinkit', { name: 'Blinkit', orderId: 'B1', total: 512, currency: 'INR', items: [] })
  assert.equal(o.title, 'Blinkit order')
  assert.deepEqual(o.amount, { value: 512, currency: 'INR' })
  const m = summarize('sms', { text: 'Rs 120 debited' })
  assert.deepEqual([m.app, m.title, m.text], ['sms', 'Bank SMS', 'Rs 120 debited'])
  assert.equal(summarize('gmail', { subject: 'Your order', text: 'Thanks' }).text, 'Your order · Thanks')
})
