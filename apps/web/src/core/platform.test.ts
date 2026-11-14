import assert from 'node:assert/strict'
import { test } from 'node:test'
import { connectorUnavailable, HOST_LOCAL, inContainer, SHOP_IN_DOCKER } from './platform'

const shop = { login: { url: 'https://example.com' } } as never
const key = {} as never

test('shopping apps are unavailable in a container, everything else is not', () => {
  assert.equal(connectorUnavailable(shop, { RELIFE_CONTAINER: '1' }), SHOP_IN_DOCKER)
  assert.equal(connectorUnavailable(key, { RELIFE_CONTAINER: '1' }), null)
})

test('outside a container nothing is unavailable', () => {
  assert.equal(connectorUnavailable(shop, {}), null)
  assert.ok(!inContainer({ RELIFE_CONTAINER: '0' }))
  assert.ok(inContainer({ RELIFE_CONTAINER: '1' }))
})

test('a connector that reads the host is closed to a member, and open to the owner', () => {
  const anki = { hostLocal: true } as never
  assert.equal(connectorUnavailable(anki, {}, true), HOST_LOCAL)
  assert.equal(connectorUnavailable(anki, {}, false), null)
  assert.equal(connectorUnavailable(anki), null)
  assert.equal(connectorUnavailable(key, {}, true), null, 'a plain key connector stays open to members')
})
