// Import Binance trade-history CSV exports (history older than the API returns).
//   npx tsx --env-file=.env scripts/binance-import.ts ~/Downloads/trade-history.csv [more.csv]
// Re-importing the same file is safe: every row has a stable id.
// ponytail: rows also fetched by the API connector will appear twice; import only periods before your API sync.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { emitRaw, processNew } from '@/core/ingest'
import { getUser } from '@/core/user'
import { sql } from '@/db'

/** Minimal CSV: quoted fields with "" escapes, comma separated. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

async function main() {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.error('Usage: scripts/binance-import.ts <file.csv> [...]')
    process.exit(1)
  }
  const user = await getUser()
  let inserted = 0
  for (const file of files) {
    const [header, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''))
    for (const r of rows) {
      const body = Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()]))
      const date = body['Date(UTC)'] ?? body['Date'] ?? ''
      const at = new Date(`${date.replace(' ', 'T')}Z`)
      const externalId = createHash('sha256').update(r.join(',')).digest('hex').slice(0, 24)
      if (await emitRaw(user.id, { source: 'binance.csv', externalId, at: Number.isNaN(at.getTime()) ? new Date() : at, body })) inserted++
    }
    console.log(`${file}: ${rows.length} rows`)
  }
  const counts = await processNew(100_000)
  console.log(`New rows: ${inserted}. Parsed: ${counts.parsed}, ignored: ${counts.ignored}, failed: ${counts.failed}`)
  await sql.end()
}

if (process.argv[1]?.endsWith('binance-import.ts')) main()
