import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTableName } from 'drizzle-orm'
import { exportTables, schemaHash, schemaTables, TABLES, wipeGlobalTables } from './tables'

const names = TABLES.map((t) => t.name)

test('every table in the schema is classified exactly once', () => {
  const all = schemaTables().map((t) => t.name).sort()
  assert.deepEqual([...names].sort(), all, 'add a line to TABLES in core/data/tables.ts for each new table (export and wipe)')
  assert.equal(new Set(names).size, names.length, 'a table is listed twice')
})

test('tables that are not exported say why', () => {
  for (const t of TABLES) if (!t.export) assert.ok(t.why, `${t.name} needs a reason`)
})

test('devices, pairings and push subscriptions are never exported', () => {
  for (const n of ['devices', 'pairings', 'push_subscriptions']) assert.equal(TABLES.find((t) => t.name === n)?.export, false, n)
})

test('saved keys never leave: connections drop the encrypted column and the cursor', () => {
  const c = TABLES.find((t) => t.name === 'connections')
  assert.ok(c && c.export)
  assert.ok(c.export.drop?.includes('secrets_encrypted'))
  assert.ok(c.export.drop?.includes('cursor'))
})

test('no exported column holds a token or key', () => {
  for (const t of schemaTables()) {
    const rule = TABLES.find((r) => r.name === t.name)
    const dropped = rule && rule.export ? rule.export.drop ?? [] : []
    for (const col of t.columns) {
      if (rule && rule.export && /secret|token_hash/.test(col.name)) assert.ok(dropped.includes(col.name), `${t.name}.${col.name} would be exported`)
    }
  }
})

test('every foreign key points at an earlier table, so an import can insert in order', () => {
  for (const t of schemaTables()) {
    for (const fk of t.foreignKeys) {
      const target = getTableName(fk.reference().foreignTable)
      if (target === t.name) continue // a column pointing at its own table is inserted in two passes (selfRef)
      assert.ok(names.indexOf(target) < names.indexOf(t.name), `${t.name} references ${target}, which must come first in TABLES`)
    }
  }
})

test('a table that points at itself lists the column as selfRef', () => {
  for (const t of schemaTables()) {
    for (const fk of t.foreignKeys) {
      if (getTableName(fk.reference().foreignTable) !== t.name) continue
      const rule = TABLES.find((r) => r.name === t.name)
      for (const col of fk.reference().columns) assert.ok(rule?.selfRef?.includes(col.name), `${t.name}.${col.name} needs selfRef`)
    }
  }
})

test('users come first, global tables are wiped, the rest of the registry helpers', () => {
  assert.equal(names[0], 'users')
  assert.deepEqual(wipeGlobalTables().sort(), ['idempotency'])
  assert.equal(exportTables().length, TABLES.filter((t) => t.export).length)
  assert.match(schemaHash(), /^[0-9a-f]{64}$/)
})
