import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

/**
 * Opt-in (RELIFE_DATA_INTEGRATION=1, RELIFE_MOCK=1): export, wipe and import on the mock database. The test wipes the mock
 * user and imports the export again, so the mock data is back when it ends.
 *
 * set -a; . ./.env; set +a
 * RELIFE_MOCK=1 RELIFE_DATA_INTEGRATION=1 tsx --test src/core/data.integration.test.ts
 */
const enabled = process.env.RELIFE_DATA_INTEGRATION === '1'

test('export, wipe and import round trip on the mock database', { skip: !enabled }, async (t) => {
  assert.equal(process.env.RELIFE_MOCK, '1', 'integration tests require RELIFE_MOCK=1')
  const dataDir = mkdtempSync(join(tmpdir(), 'relife-data-'))
  process.env.RELIFE_DATA_DIR = dataDir
  process.env.RELIFE_SECRET_KEY = randomBytes(32).toString('base64')
  delete process.env.RELIFE_DEMO

  const { sql, databaseUrl } = await import('@/db')
  assert.ok(new URL(databaseUrl).pathname.endsWith('_mock'), 'must run on the _mock database')
  const { getUser, clearUserCache } = await import('./user')
  const { encrypt } = await import('./secrets')
  const { exportZip } = await import('./data/export')
  const { importExport } = await import('./data/import')
  const { wipeUserData } = await import('./data/wipe')
  const { exportTables, wipeGlobalTables } = await import('./data/tables')

  const user = await getUser()
  const countOf = async (name: string, where: string, uid: string) =>
    Number((await sql.unsafe(`select count(*)::int as n from "${name}" t ${where}`, [uid]))[0].n)
  const whereOf = { user: 'where t.user_id = $1', self: 'where t.id = $1', 'via-schedule': 'where t.schedule_id in (select id from schedules where user_id = $1)', all: 'where $1 = $1' }
  const counts = async (uid: string) => Object.fromEntries(await Promise.all(exportTables().map(async (r) => [r.name, await countOf(r.name, whereOf[r.export.where], uid)])))

  // Something to protect: a device, a connection with one secret and one plain setting, and the folders a wipe clears.
  const [{ id: deviceId }] = await sql`insert into devices (user_id, kind, name, scopes, token_hash, expires_at)
    values (${user.id}, 'browser', 'integration test', ${['full']}, ${randomBytes(32)}, now() + interval '1 day') returning id`
  const [before] = await sql`select secrets_encrypted, profile from connections c join users u on u.id = c.user_id where c.connector_id = 'github' and u.id = ${user.id}`
  await sql`update connections set secrets_encrypted = ${encrypt({ GITHUB_TOKEN: 'tok-secret-1', GITHUB_USER: 'octo-test' })} where user_id = ${user.id} and connector_id = 'github'`
  await sql`update users set profile = profile || '{"requireSignIn": true}'::jsonb where id = ${user.id}`
  for (const d of ['browser/shop', 'library', 'coins']) { mkdirSync(join(dataDir, d), { recursive: true }); writeFileSync(join(dataDir, d, 'x'), 'x') }

  const manifestOf = async () => {
    const parts: Uint8Array[] = []
    for await (const c of exportZip(await getUser())) parts.push(c)
    return Buffer.concat(parts)
  }
  t.after(async () => {
    await sql`delete from devices where id = ${deviceId}`
    if (before) await sql`update connections set secrets_encrypted = ${before.secrets_encrypted} where connector_id = 'github'`
    rmSync(dataDir, { recursive: true, force: true })
    await sql.end()
  })

  const digest = async (uid: string) => Object.fromEntries(await Promise.all(['entries', 'transactions', 'trades', 'raw_events', 'goals', 'xp_events', 'schedules', 'checks'].map(async (n) => [n,
    (await sql.unsafe(`select md5(coalesce(string_agg(to_jsonb(t)::text, '' order by id), '')) as h from "${n}" t ${n === 'checks' ? whereOf['via-schedule'] : whereOf.user}`, [uid]))[0].h])))
  const hashes = await digest(user.id)

  // 1. Export: counts match the database, and nothing secret is in any file.
  const zip = await manifestOf()
  const files = unzipSync(new Uint8Array(zip))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  assert.equal(manifest.format, 'relife-export')
  const live = await counts(user.id)
  for (const r of exportTables()) {
    assert.equal(manifest.tables[r.name].rows, live[r.name], `${r.name} rows in the manifest`)
    assert.equal(strFromU8(files[`tables/${r.name}.jsonl`]).split('\n').filter(Boolean).length, live[r.name], `${r.name} lines`)
  }
  assert.ok(live.entries > 100 && live.transactions > 10, 'the mock database has data')
  assert.equal(strFromU8(files['csv/entries.csv']).split('\r\n').filter(Boolean).length, live.entries + 1)
  for (const [name, bytes] of Object.entries(files)) {
    const text = strFromU8(bytes)
    assert.ok(!/secrets_encrypted|token_hash|tok-secret-1/.test(text), `${name} must not hold keys or token hashes`)
  }
  const github = strFromU8(files['tables/connections.jsonl']).split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((c) => c.connector_id === 'github')
  assert.deepEqual(github.settings, { GITHUB_USER: 'octo-test' })
  assert.ok(manifest.excluded.some((e: { table: string }) => e.table === 'devices'))

  // 2. Wipe.
  await wipeUserData(user)
  clearUserCache()
  const fresh = await getUser()
  assert.notEqual(fresh.id, user.id)
  for (const r of exportTables()) {
    if (r.name === 'users') continue
    assert.equal(await countOf(r.name, whereOf[r.export.where], user.id), 0, `${r.name} for the old user`)
    if (r.export.where !== 'all') assert.equal(await countOf(r.name, whereOf[r.export.where], fresh.id), 0, `${r.name} for the new user`)
  }
  for (const g of wipeGlobalTables()) assert.equal(Number((await sql.unsafe(`select count(*)::int as n from "${g}"`))[0].n), 0, g)
  const [device] = await sql`select user_id from devices where id = ${deviceId}`
  assert.equal(device.user_id, fresh.id, 'the device moved to the fresh user')
  assert.equal(fresh.profile.requireSignIn, true, 'the sign-in rule survives a wipe')
  assert.equal(fresh.profile.onboardedAt, undefined)
  assert.equal(existsSync(join(dataDir, 'browser')), false)
  assert.equal(existsSync(join(dataDir, 'library')), false)
  assert.equal(existsSync(join(dataDir, 'coins', 'x')), true, 'public coin logos stay')

  // 3. Import into the now empty install.
  const file = join(dataDir, 'export.zip')
  writeFileSync(file, zip)
  const result = await importExport(file, { allowMock: true })
  assert.deepEqual(result.rows, Object.fromEntries(exportTables().map((r) => [r.name, manifest.tables[r.name].rows])))
  assert.ok(result.reconnect.includes('github'), 'github needs its key again')
  clearUserCache()
  const back = await getUser()
  assert.equal(back.id, user.id, 'the exported user id is back')
  assert.deepEqual(await counts(back.id), live)
  assert.deepEqual(await digest(back.id), hashes, 'every row comes back exactly')
  const [moved] = await sql`select user_id from devices where id = ${deviceId}`
  assert.equal(moved.user_id, user.id, 'the paired device follows the imported user')
  const { savedFields } = await import('./secrets')
  assert.deepEqual((await savedFields(user.id)).get('github'), { GITHUB_USER: 'octo-test' }, 'the plain setting is readable, the token is gone')

  // 4. A second import is refused: the install has data now.
  await assert.rejects(importExport(file, { allowMock: true }), /already has data/)
  await assert.rejects(importExport(file), /mock/)
})
