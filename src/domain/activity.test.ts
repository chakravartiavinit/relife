import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BROWSER_APPS, classify } from './activity'

test('classify sorts sites, apps and YouTube videos into kinds of time', () => {
  assert.equal(classify({ domain: 'app.100xdevs.com' }), 'learning')
  assert.equal(classify({ domain: 'www.boot.dev' }), 'learning')
  assert.equal(classify({ domain: 'github.com' }), 'work')
  assert.equal(classify({ domain: 'x.com' }), 'social')
  assert.equal(classify({ domain: 'www.netflix.com' }), 'entertainment')
  assert.equal(classify({ domain: 'mail.google.com' }), 'communication')
  assert.equal(classify({ domain: 'blinkit.com' }), 'shopping')
  assert.equal(classify({ domain: 'example.org' }), 'other')
  assert.equal(classify({ domain: 'youtube.com', title: 'System Design Interview: Rate Limiter' }), 'learning')
  assert.equal(classify({ domain: 'youtube.com', title: 'Week 4 live', channel: 'Harkirat Singh' }), 'learning')
  assert.equal(classify({ domain: 'youtube.com', title: 'Funniest cat fails 2026' }), 'entertainment')
  assert.equal(classify({ app: 'Cursor' }), 'work')
  assert.equal(classify({ app: 'Slack' }), 'communication')
  assert.equal(classify({ app: 'Spotify' }), 'entertainment')
  assert.equal(classify({ app: 'Finder' }), 'other')
  assert.ok(BROWSER_APPS.test('Google Chrome') && !BROWSER_APPS.test('Safari'))
  // Your rules win, and cover subdomains.
  const rules = new Map([['crunchyroll.com', 'entertainment' as const], ['youtube.com', 'learning' as const]])
  assert.equal(classify({ domain: 'beta.crunchyroll.com' }, rules), 'entertainment')
  assert.equal(classify({ domain: 'youtube.com', title: 'Funny cats' }, rules), 'learning')
})
