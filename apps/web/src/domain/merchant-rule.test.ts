import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruleMatches } from './merchant-rule'

test('long rule patterns match as substrings', () => {
  assert.ok(ruleMatches('chaipoint chaipoint@upi', 'chaipoint'))
  assert.ok(ruleMatches('chaipoint chaipoint@upi', 'chaipoint@upi'))
  assert.ok(!ruleMatches('elsewhere', 'chaipoint'))
})

test('short rule patterns match only as whole words', () => {
  assert.ok(!ruleMatches('amazon pay', 'a'), 'a one-letter rule must not capture every merchant')
  assert.ok(!ruleMatches('kfcx', 'kfc'))
  assert.ok(ruleMatches('kfc mg road', 'kfc'))
  assert.ok(ruleMatches('order at kfc', 'kfc'))
  assert.ok(ruleMatches('a', 'a'))
  assert.ok(!ruleMatches('anything', ''))
  assert.ok(ruleMatches('a.b store', 'a.b'), 'regex characters are literal')
  assert.ok(!ruleMatches('axb store', 'a.b'))
})
