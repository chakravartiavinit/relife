import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from './user'
import { runAs } from './context'
import { env, envFor, isServerName, resetKeys, setMulti, setUserKeys } from './env'

const person = (id: string, role: 'owner' | 'member') => ({ id, role }) as User

// This file imports nothing that registers key names: the rule must hold on its own.
test('a member whose keys are not loaded never reads the server’s own (the owner’s) key', () => {
  process.env.TEST_CONNECTOR_KEY = 'owner-secret'
  try {
    resetKeys()
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
  } finally { resetKeys(); delete process.env.TEST_CONNECTOR_KEY }
})

test('an unloaded member reads only the server’s own settings, with nothing registered', () => {
  const set = { RELIFE_PUBLIC_URL: 'http://x', LLM_DEFAULT: 'a:b', NODE_ENV: 'test', PORT: '1', TZ: 'UTC', DATABASE_URL: 'postgres://x', ANTHROPIC_API_KEY: 'sk', TELEGRAM_BOT_TOKEN: 't', OURA_CLIENT_ID: 'c', SOME_FUTURE_TOKEN: 'owner', BINANCE_API_KEY: 'owner', GITHUB_TOKEN: 'owner', TELEGRAM_ALLOWED_CHAT_ID: '9' }
  const was = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]))
  Object.assign(process.env, set)
  try {
    resetKeys()
    setMulti(true)
    const bea = person('b', 'member')
    const read = (k: string) => runAs(bea, () => env(k))
    for (const k of ['RELIFE_PUBLIC_URL', 'LLM_DEFAULT', 'NODE_ENV', 'PORT', 'TZ', 'DATABASE_URL', 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN', 'OURA_CLIENT_ID']) {
      assert.equal(read(k), set[k as keyof typeof set], `${k} is the server's own`)
      assert.equal(envFor(bea.id, k), set[k as keyof typeof set])
    }
    for (const k of ['SOME_FUTURE_TOKEN', 'BINANCE_API_KEY', 'GITHUB_TOKEN', 'TELEGRAM_ALLOWED_CHAT_ID']) {
      assert.equal(read(k), undefined, `${k} is a person's own, even though no module registered it`)
      assert.equal(envFor(bea.id, k), undefined)
      assert.equal(runAs(person('o', 'owner'), () => env(k)), set[k as keyof typeof set], 'the owner still reads the server’s .env')
    }
    assert.equal(isServerName('BINANCE_API_KEY'), false)
  } finally {
    resetKeys()
    for (const [k, v] of Object.entries(was)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
})
