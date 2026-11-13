// Applies the generated migrations (apps/web/drizzle) to the database, then creates the key file.
//
//   npm run db:migrate          dev (reads ../../.env)
//   relife migrate              the Docker `migrate` service
//
// RELIFE_MOCK=1 targets `<db>_mock` and creates it when it is missing.
import { databaseUrl, isMock, sql } from '@/db'
import { runMigrations } from '@/core/migrate-run'
import { ensureKeyFile } from '@/core/secrets'

async function main() {
  await runMigrations(databaseUrl, { create: isMock, log: (m) => console.log(`[migrate] ${m}`) })
  // The web app and the worker both start after this: make the key file here so they never race to create it.
  await ensureKeyFile()
  console.log('[migrate] up to date')
  await sql.end()
}

main().catch((e) => { console.error('[migrate]', e instanceof Error ? e.message : e); process.exit(1) })
