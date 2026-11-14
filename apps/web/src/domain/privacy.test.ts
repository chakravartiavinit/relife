import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agoText, aiWhere, howItConnects, maskingLine } from './privacy'

const base = { name: 'Strava', fields: [], oauth: undefined, login: undefined, reach: undefined }

test('how a source connects follows what its dialog asks for', () => {
  assert.equal(howItConnects({ ...base, oauth: { authorizeUrl: '', tokenUrl: '', scopes: [], clientIdEnv: '', clientSecretEnv: '', setupUrl: '' } }), 'Sign-in with Strava')
  assert.match(howItConnects({ ...base, login: { url: 'https://x' } }), /Browser sign-in.*data\/browser/)
  assert.equal(howItConnects({ ...base, fields: [{ env: 'A', label: 'Key', secret: true }] }), 'API key, sent only to Strava')
  assert.equal(howItConnects({ ...base, fields: [{ env: 'U', label: 'Username' }] }), 'Public username')
  assert.equal(howItConnects(base), 'Nothing to connect')
  assert.match(howItConnects({ ...base, reach: 'local', fields: [{ env: 'P', label: 'Path' }] }), /Runs on this machine/)
  assert.equal(howItConnects({ ...base, reach: 'public' }), 'No sign-in')
})

test('a local model stays here, any other leaves, and no model sends nothing', () => {
  assert.equal(aiWhere('local:qwen3:4b-instruct', true), 'local')
  assert.equal(aiWhere('anthropic:claude-sonnet-5-5', true), 'cloud')
  assert.equal(aiWhere('anthropic:claude-sonnet-5-5', false), 'off')
  assert.equal(aiWhere(undefined, false), 'off')
})

test('the masking line says what it does not cover', () => {
  assert.match(maskingLine(true), /Merchant names, amounts and routine names still go/)
  assert.match(maskingLine(false), /Masking is off/)
})

test('relative times', () => {
  const now = Date.parse('2026-11-14T12:00:00Z')
  assert.equal(agoText(null, now), 'never')
  assert.equal(agoText('2026-11-14T11:59:30Z', now), 'just now')
  assert.equal(agoText('2026-11-14T11:55:00Z', now), '5 min ago')
  assert.equal(agoText('2026-11-14T09:00:00Z', now), '3 h ago')
  assert.equal(agoText('2026-11-13T12:00:00Z', now), '1 day ago')
})
