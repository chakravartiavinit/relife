import assert from 'node:assert/strict'
import test from 'node:test'
import { CommunityIndex, communityPackUrl, normalizePackUrl } from './pack-source'

test('normalizePackUrl: https only, a GitHub page becomes its raw file, junk is refused with a reason', () => {
  assert.deepEqual(normalizePackUrl(' https://example.com/a.json#x '), { ok: true, url: 'https://example.com/a.json' })
  assert.deepEqual(normalizePackUrl('https://github.com/o/r/blob/main/packs/a.json'), { ok: true, url: 'https://raw.githubusercontent.com/o/r/main/packs/a.json' })
  for (const bad of ['', 'http://example.com/a.json', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', 'https://u:p@example.com/a.json', 'https://github.com/o/r']) {
    const r = normalizePackUrl(bad)
    assert.equal(r.ok, false, bad)
    assert.ok(!r.ok && r.error.length > 5)
  }
})

test('the community index checks every entry, and an id cannot reach another path', () => {
  assert.equal(CommunityIndex.safeParse([{ id: 'good-sleep', name: 'Sleep', description: 'd', areas: ['health'] }]).success, true)
  assert.equal(CommunityIndex.safeParse([{ id: '../x', name: 'Sleep', description: 'd', areas: [] }]).success, false)
  assert.equal(communityPackUrl('good-sleep'), 'https://raw.githubusercontent.com/chakravartiavinit/relife/main/community/packs/good-sleep.json')
})
