import assert from 'node:assert/strict'
import test from 'node:test'
import brand from '@relife/brand/brand.json'
import { CommunityIndex, communityPackUrl, normalizePackUrl, packErrorText } from './pack-source'

test('normalizePackUrl: https from the allow-list only, a GitHub page becomes its raw file, junk is refused with a reason', () => {
  assert.deepEqual(normalizePackUrl(' https://raw.githubusercontent.com/o/r/main/a.json#x '), { ok: true, url: 'https://raw.githubusercontent.com/o/r/main/a.json', host: 'raw.githubusercontent.com' })
  assert.deepEqual(normalizePackUrl('https://gist.githubusercontent.com/o/abc/raw/a.json'), { ok: true, url: 'https://gist.githubusercontent.com/o/abc/raw/a.json', host: 'gist.githubusercontent.com' })
  assert.deepEqual(normalizePackUrl('https://github.com/o/r/blob/main/packs/a.json'), { ok: true, url: 'https://raw.githubusercontent.com/o/r/main/packs/a.json', host: 'raw.githubusercontent.com' })
  assert.deepEqual(normalizePackUrl('https://relife.example:3030/packs/a.json', 'https://relife.example:3030'), { ok: true, url: 'https://relife.example:3030/packs/a.json', host: 'relife.example:3030' })
  for (const bad of [
    '', 'http://raw.githubusercontent.com/a.json', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', 'https://u:p@raw.githubusercontent.com/a.json', 'https://github.com/o/r',
    'https://example.com/a.json', 'https://192.168.1.5/a.json', 'https://localhost:3030/a.json', 'https://raw.githubusercontent.com.evil.example/a.json', 'https://evilraw.githubusercontent.com/a.json',
  ]) {
    const r = normalizePackUrl(bad)
    assert.equal(r.ok, false, bad)
    assert.ok(!r.ok && r.error.length > 5)
  }
  // The same-origin allowance is for this app's own address only.
  assert.equal(normalizePackUrl('https://other.example/a.json', 'https://relife.example:3030').ok, false)
})

test('the community index checks every entry, and an id cannot reach another path', () => {
  assert.equal(CommunityIndex.safeParse([{ id: 'good-sleep', name: 'Sleep', description: 'd', areas: ['health'] }]).success, true)
  assert.equal(CommunityIndex.safeParse([{ id: '../x', name: 'Sleep', description: 'd', areas: [] }]).success, false)
  assert.equal(communityPackUrl('good-sleep'), 'https://raw.githubusercontent.com/chakravartiavinit/relife/main/community/packs/good-sleep.json')
})

test('packErrorText: a newer-version pack says to update the app; other errors pass through', () => {
  assert.equal(packErrorText('Made by a newer version'), `Made by a newer version of ${brand.name}. Update ${brand.name} to open this pack.`)
  assert.equal(packErrorText('This is not a pack file (not valid JSON).'), 'This is not a pack file (not valid JSON).')
})
