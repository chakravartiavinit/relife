// A database made by `npm run db:push` has every table but no migration history. Before the migrator runs, its migrations
// are marked as applied, so the baseline does not try to create tables that exist. That is only safe when the database
// really is what the newest migration would leave: otherwise marking would hide a missing column from every later run.
// Pure: migrate-run.ts reads the columns and the snapshot and writes the rows.

/** `table.column` -> `<type> [not null]`, e.g. `users.name` -> `text not null`. */
export type ColumnMap = ReadonlyMap<string, string>
/** A `drizzle/meta/NNNN_snapshot.json`, as far as it matters here. */
export type Snapshot = { tables: Record<string, { name: string; columns: Record<string, { type: string; notNull?: boolean }> }> }

export const columnKey = (table: string, column: string) => `${table}.${column}`
export const columnShape = (type: string, notNull: boolean) => (notNull ? `${type} not null` : type)

/** Every column of a snapshot with its type and nullability. */
export function snapshotColumns(s: Snapshot): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of Object.values(s.tables)) for (const [c, def] of Object.entries(t.columns)) out.set(columnKey(t.name, c), columnShape(def.type, !!def.notNull))
  return out
}

/** What differs between a database and a snapshot, as short lines. Empty means they match (tables, columns, types, nullability). */
export function schemaDifferences(db: ColumnMap, snapshot: Snapshot): string[] {
  const want = snapshotColumns(snapshot)
  const out: string[] = []
  for (const [k, shape] of want) {
    const have = db.get(k)
    if (have === undefined) out.push(`missing ${k}`)
    else if (have !== shape) out.push(`${k} is ${have}, expected ${shape}`)
  }
  for (const k of db.keys()) if (!want.has(k)) out.push(`unexpected ${k}`)
  return out
}

/** How many migrations a pushed database already contains: all of them when it matches the newest snapshot, else zero. */
export function adoptedMigrations(db: ColumnMap, snapshots: readonly Snapshot[]): number {
  const newest = snapshots.at(-1)
  return newest && schemaDifferences(db, newest).length === 0 ? snapshots.length : 0
}

export const OLDER_THAN_BASELINE = 'This database does not match this version and has no migration history. Run `npm run db:push` on this version once, then start again.'
