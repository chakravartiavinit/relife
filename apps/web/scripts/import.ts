// Restore an export (Settings → Data & privacy → Export) into an empty install. Run it before you open the app for
// the first time on the new machine, with the worker stopped.
//
//   npm run import -- ~/Downloads/relife-export-2026-11-13.zip
import { existsSync } from 'node:fs'
import { importExport } from '@/core/data/import'
import { sql } from '@/db'
import brand from '@relife/brand/brand.json'

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('-'))
  if (!file || !existsSync(file)) {
    console.error('Usage: npm run import -- <relife-export.zip>')
    process.exit(file ? 1 : 2)
  }
  const r = await importExport(file, { log: (line) => console.log(`  ${line}`) })
  const total = Object.values(r.rows).reduce((a, b) => a + b, 0)
  console.log(`\nImported ${total} rows in ${Object.keys(r.rows).length} tables.`)
  for (const w of r.warnings) console.log(`Note: ${w}`)
  if (r.reconnect.length) console.log(`Reconnect: ${r.reconnect.join(', ')} (saved keys are never exported; open You → Connections).`)
  console.log(`Start ${brand.name}, then pair this browser with \`npm run signin\` if it asks you to connect.`)
  await sql.end({ timeout: 5 })
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e)
  await sql.end({ timeout: 5 }).catch(() => {})
  process.exit(1)
})
