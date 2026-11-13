// Write a backup now: pg_dump of the database plus secret.key and library covers, in one .tar.gz (encrypted when
// RELIFE_BACKUP_PASSPHRASE is set). Where it goes: RELIFE_BACKUP_DIR, else backups/ at the repo root.
//
//   npm run backup
//   docker compose exec worker npm run backup
import { backupNow } from '@/core/data/backup'
import { sql } from '@/db'

async function main() {
  const r = await backupNow({ reason: 'manual' })
  console.log(`${r.file}\n${r.message}`)
  if (!process.env.RELIFE_BACKUP_PASSPHRASE) console.log('This archive is not encrypted and contains your saved keys. Keep it private, or set RELIFE_BACKUP_PASSPHRASE.')
  await sql.end({ timeout: 5 })
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e)
  await sql.end({ timeout: 5 }).catch(() => {})
  process.exit(1)
})
