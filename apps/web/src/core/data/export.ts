import { Zip, ZipDeflate, strToU8 } from 'fflate'
import type postgres from 'postgres'
import brand from '@relife/brand/brand.json'
import pkg from '../../../package.json'
import { sql } from '@/db'
import { csvRow, type CsvCell } from '@/domain/csv'
import { integration } from '../integrations'
import { savedFields } from '../secrets'
import { localDate } from '../time'
import type { User } from '../user'
import { exportTables, schemaHash, TABLES, type CsvName, type ExportSpec } from './tables'

// A streamed ZIP of one person's data. Readable on any OS: one JSON Lines file per table (for importing again), CSVs of
// the tabular tables (for a spreadsheet) and a manifest. Saved keys and device tokens are never included (tables.ts).
// The generator only moves on when the stream pulls, so memory stays flat however large raw_events is.

export const EXPORT_FORMAT = 'relife-export'
export const EXPORT_VERSION = 1
/** The first file in the zip: enough to refuse an export from a newer version before anything is read. */
export const FORMAT_FILE = 'format.json'
export const MANIFEST_FILE = 'manifest.json'
export const tableFile = (name: string) => `tables/${name}.jsonl`

// fflate writes plain ZIP, not ZIP64: a file or the whole archive over 4 GB cannot be represented.
const ZIP_LIMIT = 0xffff_0000
const ROWS = 500

export type ExportManifest = {
  format: typeof EXPORT_FORMAT
  version: number
  appVersion: string
  schemaHash: string
  exportedAt: string
  user: { id: string; name: string; timezone: string; baseCurrency: string }
  tables: Record<string, { file: string; rows: number }>
  csv: { file: string; rows: number }[]
  excluded: { table: string; why: string }[]
}

type Rows = postgres.Row[]
type Q = postgres.Sql | postgres.ReservedSql

const CSVS: Record<CsvName, { file: string; header: string[]; rows: (s: Q, uid: string) => AsyncIterable<Rows> }> = {
  entries: {
    file: 'csv/entries.csv',
    header: ['local_date', 'tracker', 'tracker_name', 'area', 'value', 'unit', 'source', 'verified', 'note'],
    rows: (s, uid) => s`
      select e.local_date::text, t.slug, t.name, t.category, e.value::float8, t.unit, e.source, e.verified, e.note
      from entries e join trackers t on t.id = e.tracker_id where e.user_id = ${uid} order by e.local_date, t.slug, e.source`.values().cursor(ROWS),
  },
  transactions: {
    file: 'csv/transactions.csv',
    header: ['local_date', 'at', 'amount', 'currency', 'merchant', 'category', 'account', 'upi_id', 'source', 'external_ref'],
    rows: (s, uid) => s`
      select x.local_date::text, x.at, x.amount::float8, x.currency, x.merchant, x.category, a.name, x.upi_id, x.source, x.external_ref
      from transactions x left join accounts a on a.id = x.account_id where x.user_id = ${uid} order by x.at`.values().cursor(ROWS),
  },
  trades: {
    file: 'csv/trades.csv',
    header: ['at', 'symbol', 'side', 'qty', 'price', 'fee', 'fee_asset', 'kind', 'source', 'external_ref'],
    rows: (s, uid) => s`
      select at, symbol, side, qty::float8, price::float8, fee::float8, fee_asset, kind, source, external_ref
      from trades where user_id = ${uid} order by at`.values().cursor(ROWS),
  },
  checks: {
    file: 'csv/checks.csv',
    header: ['local_date', 'routine', 'area', 'status', 'value', 'at'],
    rows: (s, uid) => s`
      select c.local_date::text, r.name, r.category, c.status, c.value::float8, c.at
      from checks c join schedules r on r.id = c.schedule_id where r.user_id = ${uid} order by c.local_date, r.name`.values().cursor(ROWS),
  },
}

function where(s: Q, spec: ExportSpec, uid: string) {
  switch (spec.where) {
    case 'user': return s`where t.user_id = ${uid}`
    case 'self': return s`where t.id = ${uid}`
    case 'via-schedule': return s`where t.schedule_id in (select id from schedules where user_id = ${uid})`
    case 'all': return s``
  }
}

/** The non-secret connection settings (a username, a URL), by connector id. Secret values and OAuth tokens stay out. */
async function connectionSettings(userId: string) {
  const out = new Map<string, Record<string, string>>()
  for (const [id, saved] of await savedFields(userId)) {
    const fields = integration(id)?.fields ?? []
    const plain = Object.fromEntries(fields.filter((f) => !f.secret && saved[f.env]).map((f) => [f.env, saved[f.env]]))
    if (Object.keys(plain).length) out.set(id, plain)
  }
  return out
}

const README = (m: ExportManifest) => `${brand.name} export, ${m.exportedAt.slice(0, 10)}

format.json, manifest.json   what this archive is, and how many rows each file holds
tables/*.jsonl               one JSON object per line, one file per table: everything, so it can be imported again
csv/*.csv                    entries, transactions, trades and routine checks for a spreadsheet

Left out on purpose
${m.excluded.map((e) => `  ${e.table}: ${e.why}`).join('\n')}
  Saved keys and tokens: connections keep their non-secret settings (a username, a URL); the keys themselves, sign-in
  tokens and sync progress are not in this file. Connect those sources again after an import.

To import into a fresh install (an empty database):  npm run import -- <this file>
`

/** The export as ZIP chunks. Reads one consistent snapshot of the database. */
export async function* exportZip(user: User): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = []
  let failure: unknown
  let written = 0
  const zip = new Zip((err, chunk) => {
    if (err) failure = err
    else { out.push(chunk); written += chunk.length }
  })
  const take = () => {
    if (failure) throw failure
    if (written > ZIP_LIMIT) throw new Error('This export is over 4 GB, which the ZIP format used here cannot hold.')
    return out.splice(0)
  }
  /** One file in the zip: `add` text, then `close`. */
  const open = (name: string) => {
    const f = new ZipDeflate(name, { level: 6 })
    zip.add(f)
    let size = 0
    return {
      add(text: string) {
        const b = strToU8(text)
        size += b.length
        if (size > ZIP_LIMIT) throw new Error(`${name} is over 4 GB, which the ZIP format used here cannot hold.`)
        f.push(b)
      },
      close() { f.push(new Uint8Array(0), true) },
    }
  }
  const whole = (name: string, text: string) => { const f = open(name); f.add(text); f.close() }

  const tables = exportTables()
  const manifest: ExportManifest = {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, appVersion: pkg.version, schemaHash: schemaHash(),
    exportedAt: new Date().toISOString(),
    user: { id: user.id, name: user.name, timezone: user.timezone, baseCurrency: user.baseCurrency },
    tables: {}, csv: [],
    excluded: TABLES.filter((t) => !t.export).map((t) => ({ table: t.name, why: t.why ?? '' })),
  }

  const conn = await sql.reserve()
  let committed = false
  try {
    await conn`begin isolation level repeatable read read only`
    whole(FORMAT_FILE, JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, appVersion: manifest.appVersion, schemaHash: manifest.schemaHash }, null, 2))
    yield* take()

    const settings = await connectionSettings(user.id)
    for (const t of tables) {
      const file = open(tableFile(t.name))
      let rows = 0
      const drop = t.export.drop ?? []
      for await (const batch of conn`select (to_jsonb(t) - ${drop}::text[])::text as j from ${conn(t.name)} t ${where(conn, t.export, user.id)}`.cursor(ROWS)) {
        file.add(batch.map((r) => {
          if (t.name !== 'connections') return r.j + '\n'
          const row = JSON.parse(r.j)
          const plain = settings.get(row.connector_id)
          return JSON.stringify(plain ? { ...row, settings: plain } : row) + '\n'
        }).join(''))
        rows += batch.length
        yield* take()
      }
      file.close()
      manifest.tables[t.name] = { file: tableFile(t.name), rows }
      yield* take()
    }

    for (const t of tables) {
      if (!t.export.csv) continue
      const spec = CSVS[t.export.csv]
      const file = open(spec.file)
      file.add(csvRow(spec.header))
      let rows = 0
      for await (const batch of spec.rows(conn, user.id)) {
        file.add(batch.map((r) => csvRow(r as unknown as CsvCell[])).join(''))
        rows += batch.length
        yield* take()
      }
      file.close()
      manifest.csv.push({ file: spec.file, rows })
      yield* take()
    }
    await conn`commit`
    committed = true
  } finally {
    if (!committed) await conn`rollback`.catch(() => {})
    conn.release()
  }

  whole('README.txt', README(manifest))
  // Row counts are known only now, so the manifest comes last.
  whole(MANIFEST_FILE, JSON.stringify(manifest, null, 2))
  zip.end()
  yield* take()
}

/** `relife-export-2026-11-13.zip`, dated in the user's own time zone. */
export const exportFileName = (user: Pick<User, 'timezone'>, now = new Date()) => `relife-export-${localDate(now, user.timezone)}.zip`

/** An async generator as a web stream (cancelling it, when the browser stops downloading, stops the queries). */
export function streamOf(it: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    async cancel() { await it.return(undefined) },
  })
}
