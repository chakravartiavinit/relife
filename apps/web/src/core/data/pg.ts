import { spawn } from 'node:child_process'
import { accessSync, constants, createReadStream, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'
import { databaseUrl, sql } from '@/db'

// The PostgreSQL client tools (pg_dump, pg_restore) that backups need. Looked for in RELIFE_PG_BIN (a folder), then PATH,
// then where Homebrew puts the keg-only libpq. Connection details reach them as PG* environment variables, never as
// arguments (arguments show up in `ps`).

const EXTRA_DIRS = ['/opt/homebrew/opt/libpq/bin', '/usr/local/opt/libpq/bin']

export type PgTool = 'pg_dump' | 'pg_restore'

const isExecutable = (p: string) => {
  try { accessSync(p, constants.X_OK); return statSync(p).isFile() } catch { return false }
}

/** Full path to the tool, or null when it is not installed. */
export function findPgTool(name: PgTool): string | null {
  const dirs = [process.env.RELIFE_PG_BIN, ...(process.env.PATH ?? '').split(delimiter), ...EXTRA_DIRS].filter((d): d is string => !!d)
  for (const dir of dirs) if (isExecutable(join(dir, name))) return join(dir, name)
  return null
}

let cache: { at: number; found: boolean } | undefined
/** For the job's `enabled` check, which the scheduler asks every few seconds: the answer is kept for a minute. */
export function pgDumpInstalled(): boolean {
  if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), found: !!findPgTool('pg_dump') }
  return cache.found
}

export const INSTALL_HINT = 'Install the PostgreSQL 16 client tools: `brew install libpq` on a Mac, `apt install postgresql-client-16` on Linux (the Docker image has them). Set RELIFE_PG_BIN if they are somewhere else.'

/** The connection as PG* variables, from the same URL the app uses (the `_mock` database in mock mode). */
export function pgEnv(url = databaseUrl): Record<string, string> {
  const u = new URL(url)
  const e: Record<string, string> = { PGHOST: u.hostname, PGPORT: u.port || '5432', PGDATABASE: decodeURIComponent(u.pathname.slice(1)) }
  if (u.username) e.PGUSER = decodeURIComponent(u.username)
  if (u.password) e.PGPASSWORD = decodeURIComponent(u.password)
  const ssl = u.searchParams.get('sslmode') ?? u.searchParams.get('ssl')
  if (ssl) e.PGSSLMODE = ssl === 'true' ? 'require' : ssl
  return e
}

export const databaseName = (url = databaseUrl) => decodeURIComponent(new URL(url).pathname.slice(1))

/** The tool's path, after checking that its major version is at least the server's (an older pg_dump refuses a newer server). */
export async function requirePgTool(name: PgTool): Promise<string> {
  const path = findPgTool(name)
  if (!path) throw new Error(`${name} is not installed. ${INSTALL_HINT}`)
  let out = ''
  await spawnTo(path, ['--version'], { onStdout: (d) => (out += d) })
  const tool = Number(/\)\s*(\d+)/.exec(out)?.[1])
  const [{ v }] = await sql`select current_setting('server_version_num')::int / 10000 as v`
  if (tool && Number(v) > tool) throw new Error(`${name} is version ${tool}, older than the database server (${v}). ${INSTALL_HINT}`)
  return path
}

type SpawnOptions = {
  env?: Record<string, string>
  /** A file piped into the tool's stdin. */
  input?: string
  /** Where the tool's stdout goes. */
  output?: Writable
  onStdout?: (chunk: string) => void
}

/** Run a program to the end. Rejects with the last of its error output when it exits non-zero. */
export async function spawnTo(cmd: string, args: string[], o: SpawnOptions = {}): Promise<void> {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...o.env },
    stdio: [o.input ? 'pipe' : 'ignore', o.output || o.onStdout ? 'pipe' : 'ignore', 'pipe'],
  })
  let err = ''
  child.stderr!.on('data', (d) => { err = (err + d).slice(-2000) })
  if (o.onStdout) child.stdout!.on('data', (d) => o.onStdout!(String(d)))
  const exited = new Promise<void>((ok, fail) => {
    child.on('error', (e) => fail((e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(`${cmd} is not installed.`) : e))
    child.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${cmd.split('/').pop()} failed (exit ${code}): ${err.trim() || 'no message'}`))))
  })
  const pipes = [
    o.output && pipeline(child.stdout!, o.output),
    o.input && pipeline(createReadStream(o.input), child.stdin!),
  ].filter(Boolean) as Promise<void>[]
  // A tool that exits early breaks the pipes (EPIPE): its own message is the useful one.
  const [exit, ...rest] = await Promise.allSettled([exited, ...pipes])
  if (exit.status === 'rejected') throw exit.reason
  const broken = rest.find((r) => r.status === 'rejected')
  if (broken) throw (broken as PromiseRejectedResult).reason
}
