import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionAllowed, parseAction, plain, pushState, toPush, urlFor } from './push'

const RID = '0b7e9a52-3c14-4f68-a1d3-7e5c2b90f4a8'
const SID = '9f1b3d58-4e6a-4c20-b7d9-2a5c8e0f1b05'

// Button data as bot/messages.ts, rules/run.ts, bot/ui.ts and the AI jobs write it.
const REMINDER = [[{ text: '✅ Done', data: `r:d:${RID}` }], [{ text: '⏰ Later', data: `r:z:${RID}` }, { text: '⏭ Skip', data: `r:s:${RID}` }]]
const GOAL = [[{ text: '+250ml', data: `r:p1:${RID}` }, { text: '+500ml', data: `r:p2:${RID}` }], [{ text: '⏰ Later', data: `r:z:${RID}` }]]
const ALERT = [[{ text: '💬 Why?', data: `a:w:${RID}` }, { text: '✓ Got it', data: `a:k:${RID}` }], [{ text: '↗ Open Coach', url: 'https://mac.tail1.ts.net/coach' }]]

test('plain: Telegram HTML to text', () => {
  assert.equal(plain('⏰ <b>Water &amp; tea</b>\n<i>08:00 · 1 of 3</i>'), '⏰ Water & tea\n08:00 · 1 of 3')
  assert.equal(plain('a &lt;b&gt; &#39;q&#39; &#x1F4A7; &unknown;'), "a <b> 'q' 💧 &unknown;")
  assert.equal(plain('<blockquote expandable>one\n\n\n\ntwo</blockquote>'), 'one\n\ntwo')
})

test('toPush: the first line is the title, the rest the body, and at most two runnable buttons', () => {
  const m = toPush({ text: '⏰ <b>Take vitamin D</b>\n<i>08:00</i>', ref: `reminder:${RID}` }, REMINDER)
  assert.equal(m.title, '⏰ Take vitamin D')
  assert.equal(m.body, '08:00')
  assert.equal(m.url, '/')
  assert.deepEqual(m.actions, [{ action: `r:d:${RID}`, title: '✅ Done' }, { action: `r:z:${RID}`, title: '⏰ Later' }])
  assert.deepEqual(toPush({ text: '💧 <b>Water</b>', ref: `reminder:${RID}` }, GOAL).actions.map((a) => a.title), ['+250ml', '+500ml'])
})

test('toPush: the body is capped, a title-only message has an empty body, nothing runnable means no actions', () => {
  const long = toPush({ text: `<b>T</b>\n${'x'.repeat(500)}` }, null)
  assert.equal(long.body.length, 240)
  assert.ok(long.body.endsWith('…'))
  assert.deepEqual(toPush({ text: 'Just a line' }, undefined), { title: 'Just a line', body: '', url: '/', actions: [] })
  assert.deepEqual(toPush({ text: 'x' }, [[{ text: '📜 Quest log', data: 'q:o' }, { text: '✓ Noted', data: 'noop' }]]).actions, [])
})

test('toPush: a "Why?" button opens the app; a url button is made relative so any host works', () => {
  const m = toPush({ text: '⚠️ <b>Spending is up</b>\nWealth', ref: `insight:${RID}` }, ALERT)
  assert.deepEqual(m.actions, [{ action: `a:w:${RID}`, title: '💬 Why?', open: `/?peek=insight:${RID}` }, { action: `a:k:${RID}`, title: '✓ Got it' }])
  assert.equal(m.url, '/coach', 'the first url button, as a path')
  assert.equal(toPush({ text: 'x', ref: `insight:${RID}` }, null).url, `/?peek=insight:${RID}`)
})

test('urlFor: reminders open Today, insights open their peek, anything else Today', () => {
  assert.equal(urlFor(`reminder:${RID}`), '/')
  assert.equal(urlFor(`insight:${RID}`), `/?peek=insight:${RID}`)
  assert.equal(urlFor('test:abc'), '/')
  assert.equal(urlFor(null), '/')
})

test('parseAction: every runnable Telegram callback, and nothing else', () => {
  assert.deepEqual(parseAction(`r:d:${RID}`), { type: 'reminder', id: RID, op: 'd' })
  assert.deepEqual(parseAction(`r:s:${RID}`), { type: 'reminder', id: RID, op: 's' })
  assert.deepEqual(parseAction(`r:p2:${RID}`), { type: 'reminder', id: RID, op: 'p2' })
  assert.deepEqual(parseAction(`r:z:${RID}`), { type: 'snooze', id: RID, minutes: 60 }, 'Later is an hour')
  assert.deepEqual(parseAction(`t:d:${SID}:1k2m3n`), { type: 'check', scheduleId: SID, occ: '1k2m3n' })
  assert.deepEqual(parseAction(`t:p:${SID}`), { type: 'step', scheduleId: SID })
  assert.deepEqual(parseAction(`i:a:${RID}`), { type: 'insight', id: RID, op: 'a' })
  assert.deepEqual(parseAction(`i:d:${RID}`), { type: 'insight', id: RID, op: 'd' })
  assert.deepEqual(parseAction(`a:k:${RID}`), { type: 'noted', id: RID })
  assert.deepEqual(parseAction(`a:w:${RID}`), { type: 'open', url: `/?peek=insight:${RID}` })
  assert.deepEqual(parseAction(`c:o:${RID}`), { type: 'chest', id: RID })
  assert.deepEqual(parseAction('m:4'), { type: 'mood', value: 4 })
  for (const no of ['noop', 'q:o', 'q:r', 't:o', 't:r', 's:o', 'm:o', 'm:6', `r:u:${RID}`, `r:b:${RID}`, `r:z15:${RID}`, 'r:d:not-an-id', `r:d:${RID}:x`, 'x:y:z', '']) {
    assert.equal(parseAction(no), null, no)
  }
})

test('actionAllowed: only the message\'s own buttons, or the same reminder', () => {
  assert.ok(actionAllowed(`r:d:${RID}`, { buttons: REMINDER, ref: `reminder:${RID}` }))
  assert.ok(!actionAllowed(`r:d:${SID}`, { buttons: REMINDER, ref: `reminder:${RID}` }), 'another reminder')
  assert.ok(!actionAllowed(`c:o:${RID}`, { buttons: REMINDER, ref: `reminder:${RID}` }), 'a different kind of action')
  assert.ok(actionAllowed(`r:p1:${RID}`, { buttons: null, ref: `reminder:${RID}` }), 'a reminder is drawn again at each send')
  assert.ok(!actionAllowed(`r:p1:${RID}`, { buttons: null, ref: `insight:${RID}` }))
  assert.ok(!actionAllowed('anything', { buttons: null, ref: null }))
})

test('pushState: one state per case the settings row draws', () => {
  const ok = { secure: true, ios: false, standalone: false, supported: true, permission: 'default' as const, subscribed: false }
  assert.equal(pushState(ok), 'off')
  assert.equal(pushState({ ...ok, permission: 'granted', subscribed: true }), 'on')
  assert.equal(pushState({ ...ok, permission: 'granted', subscribed: false }), 'off', 'allowed but not subscribed (the server forgot it): turn on again')
  assert.equal(pushState({ ...ok, permission: 'denied' }), 'blocked')
  assert.equal(pushState({ ...ok, supported: false }), 'unsupported')
  assert.equal(pushState({ ...ok, secure: false, supported: false }), 'insecure', 'plain http has no service worker; it is not "unsupported"')
  assert.equal(pushState({ ...ok, ios: true, supported: false }), 'ios-install', 'a Safari tab on iPhone')
  assert.equal(pushState({ ...ok, ios: true, standalone: true }), 'off', 'the Home Screen app can ask')
})
