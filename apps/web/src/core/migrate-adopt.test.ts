import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adoptedMigrations, columnKey, columnShape, schemaDifferences, snapshotColumns, type Snapshot } from './migrate-adopt'

type Cols = Record<string, string | [string, boolean]>
const snap = (tables: Record<string, Cols>): Snapshot => ({
  tables: Object.fromEntries(Object.entries(tables).map(([t, cols]) => [`public.${t}`, {
    name: t,
    columns: Object.fromEntries(Object.entries(cols).map(([c, d]) => [c, Array.isArray(d) ? { type: d[0], notNull: d[1] } : { type: d }])),
  }])),
}) as Snapshot
const db = (tables: Record<string, Cols>) => snapshotColumns(snap(tables))

const base = { users: { id: ['uuid', true], name: 'text' }, entries: { id: ['uuid', true], value: 'numeric(20,8)' } } as Record<string, Cols>
const s0 = snap(base)
const s1 = snap({ ...base, users: { ...base.users, locale: 'text' } })

test('snapshot columns carry their type and nullability', () => {
  assert.equal(snapshotColumns(s0).get(columnKey('users', 'id')), columnShape('uuid', true))
  assert.equal(snapshotColumns(s0).get('entries.value'), 'numeric(20,8)')
})

test('a database that is exactly the newest snapshot adopts every migration', () => {
  assert.equal(adoptedMigrations(db(base), [s0]), 1)
  assert.equal(adoptedMigrations(db({ ...base, users: { ...base.users, locale: 'text' } }), [s0, s1]), 2)
})

test('a database that is behind the newest snapshot adopts nothing (it must be pushed first)', () => {
  assert.equal(adoptedMigrations(db(base), [s0, s1]), 0)
})

test('differences in a type, nullability, a missing column or an extra one are all refused', () => {
  assert.deepEqual(schemaDifferences(db(base), s0), [])
  assert.match(schemaDifferences(db({ ...base, users: { id: ['uuid', true], name: ['text', true] } }), s0)[0], /users\.name is text not null, expected text/)
  assert.match(schemaDifferences(db({ ...base, entries: { id: ['uuid', true], value: 'integer' } }), s0)[0], /entries\.value is integer/)
  assert.deepEqual(schemaDifferences(db({ ...base, users: { id: ['uuid', true] } }), s0), ['missing users.name'])
  assert.deepEqual(schemaDifferences(db({ ...base, extra: { x: 'text' } }), s0), ['unexpected extra.x'])
  assert.deepEqual(schemaDifferences(db({ ...base, users: { ...base.users, stray: 'text' } }), s0), ['unexpected users.stray'])
  for (const d of [{ users: { id: ['uuid', true] } }, { ...base, extra: { x: 'text' } }] as Record<string, Cols>[]) assert.equal(adoptedMigrations(db(d), [s0]), 0)
})

test('no snapshots, or an empty database, adopts nothing', () => {
  assert.equal(adoptedMigrations(db(base), []), 0)
  assert.equal(adoptedMigrations(db({}), [s0]), 0)
})
