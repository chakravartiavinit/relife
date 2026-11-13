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
})

test('an empty activity batch fills in empty lists', () => {
  assert.deepEqual(contract.ActivityBatch.parse({}), { segments: [], courses: [], rules: [] })
})
