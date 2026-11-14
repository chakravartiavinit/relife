import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from './user'
import { runAs } from './context'
import { env, envFor, resetKeys, setManagedNames, setMulti, setUserKeys } from './env'

const person = (id: string, role: 'owner' | 'member') => ({ id, role }) as User

test('a member whose keys are not loaded never reads the server’s own (the owner’s) key', () => {
  process.env.TEST_CONNECTOR_KEY = 'owner-secret'
  try {
    resetKeys()
    setManagedNames(['TEST_CONNECTOR_KEY'])
    setMulti(true)
    const owner = person('o', 'owner')
    const bea = person('b', 'member')
    // Nothing loaded for anyone: the member gets nothing; the owner's own scope still reads the server's .env.
    assert.equal(runAs(bea, () => env('TEST_CONNECTOR_KEY')), undefined)
    assert.equal(envFor(bea.id, 'TEST_CONNECTOR_KEY'), undefined)
    assert.equal(runAs(owner, () => env('TEST_CONNECTOR_KEY')), 'owner-secret')
    // Loaded for the owner only: still nothing for the member.
    setUserKeys(owner.id, new Map([['TEST_CONNECTOR_KEY', 'owner-secret']]))
    assert.equal(runAs(bea, () => env('TEST_CONNECTOR_KEY')), undefined)
    assert.equal(envFor(bea.id, 'TEST_CONNECTOR_KEY'), undefined)
    // Loaded for the member (even empty): their keys are theirs, and a name they did not connect falls back to nothing managed.
    setUserKeys(bea.id, new Map([['TEST_CONNECTOR_KEY', 'bea-secret']]))
    assert.equal(runAs(bea, () => env('TEST_CONNECTOR_KEY')), 'bea-secret')
    // A name ReLife does not manage (the server's own setting) is not withheld.
    process.env.TEST_PLAIN = 'plain'
    assert.equal(runAs(person('c', 'member'), () => env('TEST_PLAIN')), 'plain')
  } finally { resetKeys(); delete process.env.TEST_CONNECTOR_KEY; delete process.env.TEST_PLAIN }
})
