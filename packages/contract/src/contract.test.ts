import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { ZodType } from 'zod'
import * as contract from './index'

// Every fixture is <Schema>.<case>.json and must parse with that schema. The Swift tests decode the same files,
// so a schema change that breaks a fixture fails here first, then fails `swift test` until the Swift models match.

const dir = new URL('../fixtures/', import.meta.url)
const schemas: Record<string, ZodType> = {
  TodayView: contract.TodayView, TodayAction: contract.TodayAction, TodayActionResult: contract.TodayActionResult,
  ActivityBatch: contract.ActivityBatch, Hello: contract.Hello, Me: contract.Me, DeviceInfo: contract.DeviceInfo,
  PairRequestStart: contract.PairRequestStart, PairRequestStarted: contract.PairRequestStarted, PairPoll: contract.PairPoll,
  PairRedeem: contract.PairRedeem, DeviceList: contract.DeviceList, DeviceRename: contract.DeviceRename, PairRedeemResult: contract.PairRedeemResult, Event: contract.Event, ApiError: contract.ApiError,
  HealthBatch: contract.HealthBatch, HealthIngestResult: contract.HealthIngestResult, PushAction: contract.PushAction, PushActionResult: contract.PushActionResult,
}
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

test('every schema has a fixture', () => {
  const covered = new Set(files.map((f) => f.split('.')[0]))
  for (const name of Object.keys(schemas)) assert.ok(covered.has(name), `no fixture for ${name}`)
})

for (const file of files) {
  test(`fixture ${file}`, () => {
    const name = file.split('.')[0]
    const schema = schemas[name]
    assert.ok(schema, `${file}: unknown schema ${name}`)
    const parsed = schema.safeParse(JSON.parse(readFileSync(new URL(file, dir), 'utf8')))
    assert.ok(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues))
  })
}

test('the schemas reject what they should', () => {
  assert.equal(contract.PairRedeem.safeParse({ kind: 'mac' }).success, false, 'redeem needs a secret or a code')
  assert.equal(contract.PairPoll.safeParse({ status: 'approved' }).success, false, 'approved carries the device')
  assert.equal(contract.TodayAction.safeParse({ action: 'log', text: '  ' }).success, false)
  assert.equal(contract.TodayAction.safeParse({ action: 'add', scheduleId: 'nope', amount: 1 }).success, false)
  assert.equal(contract.Hello.safeParse({ app: 'other' }).success, false)
  assert.equal(contract.ApiError.safeParse({ ok: false, error: { code: 'teapot', message: '' } }).success, false)
  const day = { date: '2026-11-12', steps: 100 }
  assert.equal(contract.HealthBatch.safeParse({ source: 'health-connect', days: [{ ...day, date: '12/11/2026' }] }).success, false, 'a bad date')
  assert.equal(contract.HealthBatch.safeParse({ source: 'health-connect', days: [{ ...day, steps: -1 }] }).success, false, 'steps below 0')
  assert.equal(contract.HealthBatch.safeParse({ source: 'fitbit', days: [] }).success, false, 'only Health Connect')
  assert.equal(contract.HealthBatch.safeParse({ source: 'health-connect', days: Array.from({ length: 61 }, () => day) }).success, false, 'at most 60 days')
  assert.equal(contract.PushAction.safeParse({ id: 'nope', action: 'r:d:1' }).success, false)
  assert.equal(contract.PairRedeem.safeParse({ secret: 's', scopes: [] }).success, false, 'scopes cannot be empty')
})

test('a health day fills in an empty exercise list', () => {
  assert.deepEqual(contract.HealthDay.parse({ date: '2026-11-12' }), { date: '2026-11-12', exercise: [] })
})

test('an empty activity batch fills in empty lists', () => {
  assert.deepEqual(contract.ActivityBatch.parse({}), { segments: [], courses: [], rules: [] })
})
