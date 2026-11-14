// Restore a backup over this database. Stop the app first.
//
//   npm run restore                               list the backups
//   npm run restore -- <file> [--yes] [--force] [--no-safety-backup]
//   docker compose stop web worker && docker compose run --rm worker npm run restore -- /backups/<file> --yes && docker compose up -d
import { readdir, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { restoreBackup } from '@/core/data/restore'
import { backupDir } from '@/core/paths'
import { parseBackupName } from '@/domain/backups'
import { sql } from '@/db'
import brand from '@relife/brand/brand.json'

async function list() {
  const names = existsSync(backupDir()) ? (await readdir(backupDir())).filter((n) => parseBackupName(n)).sort().reverse() : []
  if (!names.length) return console.log(`No backups in ${backupDir()}. Make one with: npm run backup`)
  console.log(`Backups in ${backupDir()}:`)
  for (const n of names) console.log(`  ${n}  ${((await stat(backupDir(n))).size / 1_048_576).toFixed(1)} MB`)
  console.log(`\nRestore one with: ${process.env.RELIFE_CONTAINER ? 'relife restore' : 'npm run restore --'} <file>`)
}

async function main() {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const given = args.find((a) => !a.startsWith('--'))
  if (!given) return list()
  const file = isAbsolute(given) || existsSync(given) ? given : backupDir(given)
  if (!existsSync(file)) throw new Error(`${given} was not found (looked in the current folder and ${backupDir()}).`)
  const r = await restoreBackup(file, {
    yes: flags.has('--yes'), force: flags.has('--force'), safetyBackup: !flags.has('--no-safety-backup'),
    log: (l) => console.log(l),
    confirm: async (expected) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try { return (await rl.question(`This replaces everything in the database. Type ${expected} to continue: `)).trim() === expected } finally { rl.close() }
    },
  })
  console.log(`\nRestored. ${r.readable} of ${r.total} saved keys readable.`)
  if (r.readable < r.total) console.log('The rest read as not saved: reconnect those sources in You → Connections, or restore with the original key.')
  // A backup from an older version is brought up to date by the migrations, which Docker runs on every start.
  console.log(process.env.RELIFE_CONTAINER
    ? `Next: \`docker compose up -d\` (applies any newer migrations), then \`docker compose exec web relife signin\` on a new machine.`
    : `Next: \`npm run db:migrate\`, start ${brand.name}, and \`npm run signin\` on a new machine.`)
  await sql.end({ timeout: 5 })
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e)
  await sql.end({ timeout: 5 }).catch(() => {})
  process.exit(1)
})
