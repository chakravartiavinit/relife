import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adoptedMigrations, columnKey, snapshotColumns, type Snapshot } from './migrate-adopt'

const snap = (tables: Record<string, string[]>): Snapshot => ({
  tables: Object.fromEntries(Object.entries(tables).map(([t, cols]) => [`public.${t}`, { name: t, schema: '', columns: Object.fromEntries(cols.map((c) => [c, {}])) }])),
})
const db = (tables: Record<string, string[]>) => new Set(Object.entries(tables).flatMap(([t, cols]) => cols.map((c) => columnKey(t, c))))

const s0 = snap({ users: ['id', 'name'], entries: ['id', 'value'] })
const s1 = snap({ users: ['id', 'name', 'locale'], entries: ['id', 'value'] })
const s2 = snap({ users: ['id', 'name', 'locale'], entries: ['id', 'value'], goals: ['id'] })

test('snapshot columns are table.column pairs', () => {
  assert.deepEqual(snapshotColumns(s0).sort(), ['entries.id', 'entries.value', 'users.id', 'users.name'])
})

test('a database made by push at the baseline adopts the baseline only', () => {
  assert.equal(adoptedMigrations(db({ users: ['id', 'name'], entries: ['id', 'value'], extra: ['x'] }), [s0, s1, s2]), 1)
})

test('a database pushed ahead of the migrations adopts everything it already contains', () => {
  assert.equal(adoptedMigrations(db({ users: ['id', 'name', 'locale'], entries: ['id', 'value'] }), [s0, s1, s2]), 2)
  assert.equal(adoptedMigrations(db({ users: ['id', 'name', 'locale'], entries: ['id', 'value'], goals: ['id'] }), [s0, s1, s2]), 3)
})

test('a database older than the baseline adopts nothing', () => {
  assert.equal(adoptedMigrations(db({ users: ['id'] }), [s0, s1]), 0)
  assert.equal(adoptedMigrations(db({}), [s0]), 0)
  assert.equal(adoptedMigrations(db({ users: ['id', 'name'] }), []), 0)
})
