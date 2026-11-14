import assert from 'node:assert/strict'
import test from 'node:test'
import { isServerName } from './env'
import { INSTANCE_ENV, MANAGED_ENV, isInstanceKey } from './integrations'

// core/env.ts keeps its own allow-list so that fail-closed does not depend on this module having loaded.
// This test keeps the two lists in step.
test('env.ts allow-list matches the integrations’ instance keys', () => {
  assert.ok(INSTANCE_ENV.length > 5)
  for (const k of INSTANCE_ENV) assert.equal(isServerName(k), true, `${k} is a server key`)
  for (const k of MANAGED_ENV.filter((n) => !isInstanceKey(n))) assert.equal(isServerName(k), false, `${k} is a person's key`)
})
