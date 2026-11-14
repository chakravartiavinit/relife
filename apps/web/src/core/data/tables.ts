import { createHash } from 'node:crypto'
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

// Every table, and what export and wipe do with it. A test (tables.test.ts) fails when a table is missing or listed
// twice, so a new table must add one line here. The order is parents-first: it is the order of the files in an export
// and the order an import inserts them, and the test checks that every foreign key points to an earlier table.
//
//   export.where  user: user_id = me · self: id = me · via-schedule: no user_id, reached through schedules · all: global table
//   export.drop   columns left out of the file (saved keys and tokens never leave)
//   wipe          cascade: goes with the users row · all: every row is deleted · keep: left alone · replace: the users row is swapped for a fresh one
//   selfRef       columns that point at the same table: inserted as null first, filled in a second pass on import

export type CsvName = 'entries' | 'transactions' | 'trades' | 'checks'
export type ExportSpec = { where: 'user' | 'self' | 'via-schedule' | 'all'; drop?: string[]; csv?: CsvName }
export type Rule = {
  name: string
  export: false | ExportSpec
  wipe: 'cascade' | 'all' | 'keep' | 'replace'
  /** Required when export is false: shown in the export's manifest. */
  why?: string
  selfRef?: string[]
}

const user = (name: string, csv?: CsvName): Rule => ({ name, export: { where: 'user', csv }, wipe: 'cascade' })
const viaSchedule = (name: string, csv?: CsvName): Rule => ({ name, export: { where: 'via-schedule', csv }, wipe: 'cascade' })

export const TABLES: Rule[] = [
  { name: 'users', export: { where: 'self' }, wipe: 'replace' },
  user('trackers'),
  user('schedules'),
  viaSchedule('reminders'),
  viaSchedule('checks', 'checks'),
  user('insights'),
  user('accounts'),
  user('entries', 'entries'),
  user('transactions', 'transactions'),
  user('merchant_rules'),
  user('trades', 'trades'),
  user('crypto_flows'),
  user('holdings'),
  user('learning_items'),
  user('library_episodes'),
  user('people'),
  user('raw_events'),
  // The cursor can hold a rotated token (Strava), so it is dropped too; a re-sync is safe to repeat.
  { name: 'connections', export: { where: 'user', drop: ['secrets_encrypted', 'cursor'] }, wipe: 'cascade' },
  user('goals'),
  user('goal_check_ins'),
  user('goal_reviews'),
  user('plans'),
  user('activity_rules'),
  user('activity'),
  user('system_quests'),
  user('notifications'),
  user('xp_events'),
  user('achievements'),
  user('chests'),
  user('net_worth_snapshots'),
  user('streak_freezes'),
  user('briefs'),
  user('coach_messages'),
  // Global (no user_id): task, model, tokens and time only. Prompts are never stored (ai/runtime-policy.ts); the two payload columns are left out anyway.
  { name: 'llm_runs', export: { where: 'all', drop: ['request', 'response'] }, wipe: 'all' },
  { name: 'devices', export: false, wipe: 'keep', why: 'Token hashes: pair each device again instead.' },
  { name: 'pairings', export: false, wipe: 'cascade', why: 'Short-lived pairing codes.' },
  { name: 'idempotency', export: false, wipe: 'all', why: 'Operational: replay keys for retried writes.' },
  { name: 'sync_runs', export: false, wipe: 'all', why: 'Operational: each source’s recent sync attempts.' },
  { name: 'rate_limits', export: false, wipe: 'keep', why: 'Operational: sign-in attempt counters.' },
  { name: 'jobs', export: false, wipe: 'keep', why: 'Operational: when each job last ran.' },
  { name: 'heartbeats', export: false, wipe: 'keep', why: 'Operational: whether the worker is alive.' },
  { name: 'fx_rates', export: false, wipe: 'keep', why: 'Public exchange rates, fetched again.' },
]

/** Tables that go into the export, in import order. */
export const exportTables = () => TABLES.filter((t): t is Rule & { export: ExportSpec } => !!t.export)

/** Global tables a wipe empties (they have no user_id, so the users cascade does not reach them). */
export const wipeGlobalTables = () => TABLES.filter((t) => t.wipe === 'all').map((t) => t.name)

/** Every table in db/schema.ts, with its SQL name and columns. */
export function schemaTables() {
  return (Object.values(schema).filter((v) => is(v, PgTable)) as PgTable[]).map((t) => getTableConfig(t))
}

/** Changes whenever a table or column is added, renamed or removed. An import warns when it differs. */
export function schemaHash(): string {
  const parts = schemaTables().map((t) => `${t.name}(${t.columns.map((c) => c.name).sort().join(',')})`).sort()
  return createHash('sha256').update(parts.join(';')).digest('hex')
}
