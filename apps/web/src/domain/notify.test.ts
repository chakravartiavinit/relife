import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_QUIET, delivery, minutesLeftInQuiet, quietHours, repeatStep, targets } from './notify'

test('delivery merges saved choices over defaults and never repeats button-less categories', () => {
  assert.equal(delivery(undefined, 'reminders').mode, 'repeat')
  assert.deepEqual(delivery({ categories: { reminders: { everyMin: 15 } } }, 'reminders').everyMin, 15)
  assert.equal(delivery({ categories: { events: { mode: 'repeat' } } }, 'events').mode, 'once')
  assert.equal(delivery({ categories: { analysis: { mode: 'off' } } }, 'analysis').mode, 'off')
})

test('quiet hours default on, can be turned off, and work across midnight', () => {
  assert.deepEqual(quietHours(undefined), DEFAULT_QUIET)
  assert.equal(quietHours({ quiet: null }), null)
  const q = { from: '22:30', to: '07:30' }
  assert.equal(minutesLeftInQuiet(23 * 60, q), 8 * 60 + 30)
  assert.equal(minutesLeftInQuiet(7 * 60, q), 30)
  assert.equal(minutesLeftInQuiet(12 * 60, q), 0)
  assert.equal(minutesLeftInQuiet(14 * 60, { from: '13:00', to: '15:00' }), 60)
  assert.equal(minutesLeftInQuiet(14 * 60, null), 0)
})

test('repeat sends the first message plus `times` more, spaced `everyMin` apart', () => {
  const d = delivery(undefined, 'reminders') // every 30 min, 2 more times
  assert.equal(repeatStep(d, 1, 10), 'wait')
  assert.equal(repeatStep(d, 1, 30), 'resend')
  assert.equal(repeatStep(d, 2, 30), 'resend')
  assert.equal(repeatStep(d, 3, 30), 'expire')
  assert.equal(repeatStep(delivery(undefined, 'alerts'), 1, 999), 'expire')
})

test('targets: the category\'s channels, kept to the ones that are set up', () => {
  const both = delivery(undefined, 'reminders')
  assert.deepEqual(both.channels, ['telegram', 'push'], 'everything goes everywhere by default')
  assert.deepEqual(targets(both, ['telegram', 'push']), ['telegram', 'push'])
  assert.deepEqual(targets(both, ['push']), ['push'], 'push only')
  assert.deepEqual(targets(both, ['telegram']), ['telegram'], 'Telegram only, like before push existed')
  assert.deepEqual(targets(both, []), [], 'nowhere to send')
  const tg = delivery({ categories: { alerts: { channels: ['telegram'] } }, quiet: null }, 'alerts')
  assert.deepEqual(targets(tg, ['telegram', 'push']), ['telegram'], 'a category can opt out of push')
  assert.deepEqual(targets(tg, ['push']), [], 'chose Telegram, only push exists: nowhere')
})
