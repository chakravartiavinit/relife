import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pictureSpec, type PictureRef, type PictureSpec } from './picture'

const spec = (r: PictureRef) => pictureSpec(r)
const src = (s: PictureSpec) => ('src' in s ? s.src : null)

test('areas and destinations resolve to the nav pictures, by key, label or href', () => {
  assert.deepEqual(spec({ of: 'area', to: 'health' }), { type: 'art', src: '/routines/heart.png' })
  assert.equal(src(spec({ of: 'nav', to: 'Wealth' })), '/routines/money.png')
  assert.equal(src(spec({ of: 'nav', to: '/time' })), '/routines/phone.png')
  assert.equal(src(spec({ of: 'area', to: 'relationships' })), '/routines/people.png')
  assert.equal(src(spec({ of: 'nav', to: '/' })), '/routines/sunrise.png')
  assert.deepEqual(spec({ of: 'nav', to: 'You' }), { type: 'letter', name: 'You' })
})

test('routines, trackers and hobbies use the routine and hobby art', () => {
  assert.equal(src(spec({ of: 'routine', name: 'Morning skincare', kind: 'habit', area: 'health' })), '/routines/skin.png')
  assert.equal(src(spec({ of: 'tracker', name: 'Sleep' })), '/routines/sleep.png')
  assert.deepEqual(spec({ of: 'hobby', name: 'Guitar' }), { type: 'art', src: '/hobbies/guitar.png', lit: true })
})

test('categories: basket, spending and product names; an unknown name gets a letter', () => {
  assert.equal(src(spec({ of: 'category', name: 'Dairy & eggs' })), '/categories/dairy.png')
  assert.equal(src(spec({ of: 'category', name: 'Food delivery' })), '/routines/delivery.png')
  assert.equal(src(spec({ of: 'category', name: 'Groceries' })), '/routines/salad.png')
  assert.equal(src(spec({ of: 'category', name: 'Dining out' })), '/categories/eating-out.png')
  assert.equal(src(spec({ of: 'category', name: 'Uncategorized' })), '/hobbies/puzzle.png')
  assert.equal(src(spec({ of: 'category', name: 'Amul Taaza Toned Milk' })), '/categories/dairy.png')
  assert.deepEqual(spec({ of: 'category', name: 'Zzyzx' }), { type: 'letter', name: 'Zzyzx' })
})

test('merchants use their logo; without one the category picture, else a letter', () => {
  assert.deepEqual(spec({ of: 'merchant', name: 'Swiggy Instamart' }), { type: 'logo', src: '/brands/swiggy.svg', fill: false })
  assert.deepEqual(spec({ of: 'merchant', name: 'Blinkit' }), { type: 'logo', src: '/connectors/blinkit.png', fill: true })
  assert.equal(src(spec({ of: 'merchant', name: 'Corner Pharmacy', category: 'Health' })), '/routines/pill.png')
  assert.deepEqual(spec({ of: 'merchant', name: 'Corner Pharmacy' }), { type: 'letter', name: 'Corner Pharmacy' })
})

test('connectors, Telegram and AI providers resolve from their ids and names', () => {
  assert.equal(src(spec({ of: 'connector', id: 'telegram' })), '/connectors/telegram.svg')
  assert.equal(src(spec({ of: 'connector', id: 'github' })), '/connectors/github.svg')
  assert.equal(src(spec({ of: 'connector', id: 'laptop' })), '/hobbies/coding.png')
  assert.equal(src(spec({ of: 'connector', id: 'something-new', name: 'Strava' })), '/brands/strava.svg')
  for (const [id, file] of [['anthropic', 'anthropic'], ['openai', 'openai'], ['google', 'gemini'], ['openrouter', 'openrouter'], ['local', 'ollama'], ['Ollama', 'ollama'], ['Claude', 'anthropic']] as const)
    assert.equal(src(spec({ of: 'provider', id })), `/connectors/${file}.svg`, id)
})

test('coins, devices, medals and library items', () => {
  assert.deepEqual(spec({ of: 'coin', symbol: 'BTC', logo: true }), { type: 'coin', symbol: 'BTC', logo: true })
  assert.equal(src(spec({ of: 'device', name: 'iPhone' })), '/routines/phone.png')
  assert.equal(src(spec({ of: 'device', name: 'Mac' })), '/hobbies/coding.png')
  assert.deepEqual(spec({ of: 'device', name: 'Fridge' }), { type: 'letter', name: 'Fridge' })
  assert.deepEqual(spec({ of: 'achievement', id: 'week-one', tier: 'silver' }), { type: 'medal', key: 'week-one', tier: 'silver', unlocked: true })
  assert.deepEqual(spec({ of: 'library', id: 'l1', title: 'Atomic Habits', image: true }), { type: 'cover', src: '/api/library/l1/image' })
  assert.deepEqual(spec({ of: 'library', id: 'l1', title: 'x', image: true, iconOnly: true }), { type: 'logo', src: '/api/library/l1/image', fill: false })
  assert.deepEqual(spec({ of: 'library', id: 'l2', title: '100xDevs Cohort 3', provider: 'YouTube' }), { type: 'logo', src: '/brands/youtube.svg', fill: false })
  assert.deepEqual(spec({ of: 'library', id: 'l3', title: 'Deep Work' }), { type: 'letter', name: 'Deep Work' })
})

test('every shipped path a rule can return exists in public/', () => {
  const refs: PictureRef[] = [
    ...['/', '/life', '/health', '/mind', '/skills', '/wealth', '/hobbies', '/people', '/time', '/plan', '/coach'].map((to) => ({ of: 'nav' as const, to })),
    ...['Food delivery', 'Groceries', 'Personal care', 'Health', 'Rent', 'Shopping', 'Subscriptions', 'Bills', 'Transfers', 'Investments', 'Travel', 'Transport', 'Entertainment', 'Dairy & eggs', 'Other'].map((name) => ({ of: 'category' as const, name })),
    ...['telegram', 'anthropic', 'openai', 'google', 'openrouter', 'local', 'laptop'].map((id) => ({ of: 'provider' as const, id })),
    { of: 'device', name: 'phone' }, { of: 'device', name: 'laptop' },
  ]
  for (const r of refs) {
    const s = spec(r)
    if (s.type === 'letter') continue
    assert.ok(existsSync(join('public', src(s)!)), `${JSON.stringify(r)} → ${src(s)}`)
  }
})
