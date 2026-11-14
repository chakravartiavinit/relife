// The demo's last check before it serves: the database it would open must be a mock one, and the session must be read-only.
import { sql } from '@/db'

async function main() {
  const [{ name, ro }] = await sql`select current_database() as name, current_setting('transaction_read_only') as ro`
  if (!String(name).endsWith('_mock')) throw new Error(`The demo is connected to "${name}", not a mock database`)
  if (ro !== 'on') throw new Error('The demo session is not read-only (RELIFE_DEMO=1 missing?)')
  console.log(`[demo] ${name}: read-only, ready`)
  await sql.end()
}

main().then(() => process.exit(0), (e) => { console.error('[demo]', e instanceof Error ? e.message : e); process.exit(1) })
