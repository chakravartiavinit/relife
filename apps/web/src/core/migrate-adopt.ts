// A database made by `npm run db:push` has every table but no migration history. Before the migrator runs, the migrations
// that database already contains are marked as applied, so the baseline does not try to create tables that exist.
// Pure: scripts/migrate.ts reads the columns and the snapshots and writes the rows.

export type DbColumns = ReadonlySet<string>
/** A `drizzle/meta/NNNN_snapshot.json`, as far as it matters here: `{ "public.users": { columns: { id: {}, … } } }`. */
export type Snapshot = { tables: Record<string, { name: string; schema?: string; columns: Record<string, unknown> }> }

export const columnKey = (table: string, column: string) => `${table}.${column}`

/** Every `(table, column)` of a snapshot, as `table.column`. */
export function snapshotColumns(s: Snapshot): string[] {
  return Object.values(s.tables).flatMap((t) => Object.keys(t.columns).map((c) => columnKey(t.name, c)))
}

/**
 * How many of the migrations (oldest first, one snapshot each) the database already holds: the newest snapshot whose
 * columns are all present in the database, plus every one before it. Zero means even the baseline does not match.
 */
export function adoptedMigrations(dbColumns: DbColumns, snapshots: readonly Snapshot[]): number {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshotColumns(snapshots[i]).every((c) => dbColumns.has(c))) return i + 1
  }
  return 0
}

export const OLDER_THAN_BASELINE = 'This database is older than the baseline. Run `npm run db:push` on this version once, then start again.'
