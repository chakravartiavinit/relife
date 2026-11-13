import { createReadStream } from 'node:fs'
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import { connectors } from '@/connectors'
import { isMock, sql } from '@/db'
import { env } from '../env'
import { integration } from '../integrations'
import { assertKeyReady, encrypt } from '../secrets'
import { clearUserCache } from '../user'
import { EXPORT_FORMAT, EXPORT_VERSION, FORMAT_FILE, MANIFEST_FILE, tableFile, type ExportManifest } from './export'
import { exportTables, schemaHash } from './tables'

// Restores an export (core/data/export.ts) into an empty install. CLI only: `npm run import -- <file.zip>`.
// One transaction: if anything is wrong, nothing is written.

export type ImportResult = {
  rows: Record<string, number>
  /** Connected sources whose keys were not in the export. */
  reconnect: string[]
  warnings: string[]
}

type Event = { kind: 'file'; name: string } | { kind: 'data'; data: Uint8Array } | { kind: 'end' }

/** The entries of a zip file, in order, as a flat event stream. Reads the file in chunks: memory stays flat. */
export async function* zipEvents(path: string): AsyncGenerator<Event> {
  const queue: Event[] = []
  let failure: unknown
  const unzip = new Unzip((f) => {
    queue.push({ kind: 'file', name: f.name })
    f.ondata = (err, data, final) => {
      if (err) failure = err
      else {
        if (data.length) queue.push({ kind: 'data', data })
        if (final) queue.push({ kind: 'end' })
      }
    }
    f.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  for await (const chunk of createReadStream(path)) {
    unzip.push(chunk as Uint8Array)
    if (failure) throw failure
    yield* queue.splice(0)
  }
  unzip.push(new Uint8Array(0), true)
  if (failure) throw failure
  yield* queue.splice(0)
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const BATCH_ROWS = 1000
const BATCH_BYTES = 8 * 1024 * 1024

export const NOT_EMPTY = 'This install already has data. Delete it first (Settings → Data & privacy) or use an empty database.'

export async function importExport(path: string, o: { allowMock?: boolean; log?: (line: string) => void } = {}): Promise<ImportResult> {
  if (env('RELIFE_DEMO') === '1') throw new Error('Import is off in the demo.')
  if (isMock && !o.allowMock) throw new Error('Import is off in mock mode: it would write into the mock database.')
  await assertKeyReady() // saved settings are encrypted again below; a lost key must stop us before anything is written

  const result: ImportResult = { rows: {}, reconnect: [], warnings: [] }
  const order = exportTables()
  const columns = new Map<string, Set<string>>()

  await sql.begin(async (tx) => {
    const columnsOf = async (table: string) => {
      let set = columns.get(table)
      if (!set) {
        const found = await tx`select column_name from information_schema.columns where table_schema = current_schema() and table_name = ${table}`
        columns.set(table, (set = new Set(found.map((r) => r.column_name as string))))
      }
      return set
    }

    /** The target must be a fresh install: nothing of yours in it, and setup not finished. */
    async function assertEmpty() {
      const [u] = await tx`select coalesce(bool_or(profile->>'onboardedAt' is not null), false) as onboarded from users`
      if (u.onboarded) throw new Error(NOT_EMPTY)
      for (const t of order) {
        if (t.export.where !== 'user') continue
        const [hit] = await tx.unsafe(`select 1 from ${quote(t.name)} limit 1`)
        if (hit) throw new Error(`${NOT_EMPTY} (${t.name} has rows.)`)
      }
    }

    // Self-referencing columns are inserted as null and filled in once the whole table is there.
    let selfRefs = new Map<string, { id: string; value: unknown }[]>()

    async function insert(table: string, batch: string[]) {
      const rule = order.find((t) => t.name === table)!
      const rows = batch.map((l) => JSON.parse(l) as Record<string, unknown>)
      const have = await columnsOf(table)
      const cols = Object.keys(rows[0]).filter((c) => have.has(c))
      const settings: { id: string; values: Record<string, string> }[] = []
      for (const r of rows) {
        for (const c of rule.selfRef ?? []) {
          if (r[c] != null) selfRefs.set(c, [...(selfRefs.get(c) ?? []), { id: r.id as string, value: r[c] }])
          r[c] = null
        }
        if (table === 'connections') {
          if (r.settings) settings.push({ id: r.id as string, values: r.settings as Record<string, string> })
          if (r.enabled && needsKeys(r.connector_id as string)) result.reconnect.push(r.connector_id as string)
        }
      }
      if (table === 'users') await tx`update users set email = null` // frees the unique email for the imported row
      const list = cols.map(quote).join(', ')
      await tx.unsafe(
        `insert into ${quote(table)} (${list}) select ${list} from json_populate_recordset(null::${quote(table)}, $1::text::json)`,
        [JSON.stringify(rows)],
      )
      for (const s of settings) await tx`update connections set secrets_encrypted = ${encrypt(s.values)} where id = ${s.id}`
      result.rows[table] = (result.rows[table] ?? 0) + rows.length
      if (table === 'users') {
        // The imported user replaces the row the install made for itself; devices that are already paired follow it.
        const id = rows[0].id as string
        await tx`update devices set user_id = ${id} where user_id <> ${id}`
        await tx`delete from users where id <> ${id}`
      }
    }

    async function finishTable(table: string) {
      for (const [column, rows] of selfRefs) {
        await tx.unsafe(
          `update ${quote(table)} t set ${quote(column)} = v.value::uuid from json_to_recordset($1::text::json) as v(id uuid, value text) where t.id = v.id`,
          [JSON.stringify(rows)],
        )
      }
      selfRefs = new Map()
      result.rows[table] ??= 0
      o.log?.(`${table}: ${result.rows[table]}`)
    }

    // Walk the zip. format.json comes first, tables follow in registry order, manifest.json is last.
    let kind: 'format' | 'table' | 'manifest' | 'other' = 'other'
    let name = ''
    let body: Buffer[] = []
    let carry = ''
    let batch: string[] = []
    let batchBytes = 0
    let lastTable = -1
    let seenFormat = false
    let manifest: ExportManifest | undefined
    const decoder = new TextDecoder()

    for await (const ev of zipEvents(path)) {
      if (ev.kind === 'file') {
        body = []
        carry = ''
        name = ev.name
        kind = 'other'
        if (name === FORMAT_FILE) kind = 'format'
        else if (!seenFormat) throw new Error(`${name} came before ${FORMAT_FILE}: this is not a ReLife export.`)
        else if (name === MANIFEST_FILE) kind = 'manifest'
        else if (name.startsWith('tables/') && name.endsWith('.jsonl')) {
          const table = name.slice('tables/'.length, -'.jsonl'.length)
          const at = order.findIndex((t) => t.name === table)
          if (at < 0) result.warnings.push(`${table}: not a table of this version, skipped.`)
          else if (at <= lastTable) throw new Error(`${name} is out of order: this is not a ReLife export.`)
          else { kind = 'table'; lastTable = at; name = table }
        }
      } else if (ev.kind === 'data') {
        if (kind === 'format' || kind === 'manifest') body.push(Buffer.from(ev.data))
        else if (kind === 'table') {
          const parts = (carry + decoder.decode(ev.data, { stream: true })).split('\n')
          carry = parts.pop() ?? ''
          for (const line of parts) {
            if (!line) continue
            batch.push(line)
            batchBytes += line.length
            if (batch.length >= BATCH_ROWS || batchBytes >= BATCH_BYTES) { const b = batch; batch = []; batchBytes = 0; await insert(name, b) }
          }
        }
      } else if (kind === 'format') {
        const f = JSON.parse(Buffer.concat(body).toString('utf8')) as { format?: string; version?: number; schemaHash?: string }
        if (f.format !== EXPORT_FORMAT) throw new Error('This is not a ReLife export.')
        if (typeof f.version !== 'number' || f.version > EXPORT_VERSION) throw new Error(`This export is version ${f.version}, newer than this ReLife understands (${EXPORT_VERSION}). Update ReLife first.`)
        if (f.schemaHash !== schemaHash()) result.warnings.push('The export was made by a different version: columns that no longer exist are skipped, new ones get their defaults.')
        await assertEmpty()
        seenFormat = true
      } else if (kind === 'table') {
        if (carry) batch.push(carry)
        if (batch.length) { const b = batch; batch = []; batchBytes = 0; await insert(name, b) }
        await finishTable(name)
      } else if (kind === 'manifest') {
        manifest = JSON.parse(Buffer.concat(body).toString('utf8')) as ExportManifest
      }
    }

    if (!manifest) throw new Error('The export has no manifest.json: the file is cut short.')
    for (const [table, info] of Object.entries(manifest.tables)) {
      const got = result.rows[table] ?? 0
      if (got !== info.rows) throw new Error(`${table}: the file has ${got} rows, the manifest says ${info.rows}.`)
    }
    if (result.rows.users !== 1) throw new Error('The export has no user.')
  })

  clearUserCache()
  result.reconnect = [...new Set(result.reconnect)]
  return result
}

/** A source that needs keys or a sign-in the export cannot carry. */
function needsKeys(connectorId: string): boolean {
  const c = connectors.find((x) => x.id === connectorId)
  if (c) return !!(c.login || c.oauth || c.fields.some((f) => f.secret))
  return !!integration(connectorId)?.fields.some((f) => f.secret)
}
