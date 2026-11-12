// Import Binance history older than the API returns (about two years of spot trades).
//   npx tsx --env-file=../../.env scripts/binance-import.ts ~/Downloads/statement.csv [more.csv]
// Takes either export:
//   - Transaction History statement (Wallet → Transaction History → Export; goes back to the account's start)
//   - Spot trade history (Orders → Spot Order → Trade History; Binance shows only recent months)
// Only trades older than the first one the API returned are kept, so nothing is counted twice.
// Re-importing the same file is safe: every row has a stable id.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { emitRaw, processNew } from '@/core/ingest'
import { getUser } from '@/core/user'
import { db, schema, sql } from '@/db'
import { and, eq, like, min } from 'drizzle-orm'
import { tradesFromStatement } from '@/parsers/binance'

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
  // The API's oldest spot trade: anything from then on is already in.
  const [{ first }] = await db.select({ first: min(schema.trades.at) }).from(schema.trades)
    .where(and(eq(schema.trades.userId, user.id), eq(schema.trades.kind, 'spot'), like(schema.trades.externalRef, 'trade:%')))
  const cutoff = first ?? new Date()
  console.log(`Keeping trades before ${cutoff.toISOString().slice(0, 16)} (the API has everything after).`)
  let inserted = 0
  for (const file of files) {
    const [header, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''))
    const cols = header.map((h) => h.trim())
    if (cols.includes('Operation') && cols.includes('Change')) {
      // Transaction History statement: rebuild trades from their lines, then hand them on in trade-history shape.
      const { trades, skipped } = tradesFromStatement(rows.map((r) => Object.fromEntries(cols.map((h, i) => [h, (r[i] ?? '').trim()]))))
      const older = trades.filter((t) => t.at < cutoff)
      for (const t of older) {
        const body = { 'Date(UTC)': t.at.toISOString().slice(0, 19).replace('T', ' '), Pair: `${t.base}${t.quote}`, Side: t.side.toUpperCase(), Price: String(t.price), Executed: `${t.qty}${t.base}`, Fee: t.fee ? `${t.fee}${t.feeAsset ?? ''}` : '0' }
        const externalId = createHash('sha256').update(`statement:${body['Date(UTC)']}:${body.Pair}:${body.Side}:${t.qty}`).digest('hex').slice(0, 24)
        if (await emitRaw(user.id, { source: 'binance.csv', externalId, at: t.at, body })) inserted++
      }
      console.log(`${file}: statement, ${trades.length} trades (${older.length} older than the API), ${skipped} line groups not a simple trade`)
      continue
    }
    for (const r of rows) {
      const body = Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()]))
      const date = body['Date(UTC)'] ?? body['Date'] ?? ''
      const at = new Date(`${date.replace(' ', 'T')}Z`)
      if (!Number.isNaN(at.getTime()) && at >= cutoff) continue // the API already has it
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
