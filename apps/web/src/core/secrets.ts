import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { INSTANCE_ENV, MANAGED_ENV, integration, integrationScope, isInstanceKey, type Integration } from './integrations'
import { envFor, setInstanceKeys, setUserKeys } from './env'
import { ownerId } from './multi-user'
import { dataDir } from './paths'
import type { SetupField } from './types'

// Keys typed into the Connect dialog are stored AES-256-GCM encrypted in connections.secrets_encrypted.
// The encryption key is RELIFE_SECRET_KEY (32 bytes, base64) or a file created on first use in the data folder (core/paths.ts).
//
// Keys have a scope (core/integrations.ts `isInstanceKey`): instance keys (AI, the Telegram bot, OAuth apps) are the
// owner's and serve everyone; the rest are each person's own, loaded into that person's map (core/env.ts).

/** .env values. Blank dialog fields fall back to these. */
const FROM_ENV: Record<string, string | undefined> = Object.fromEntries(MANAGED_ENV.map((k) => [k, process.env[k] || undefined]))

export function envDefault(key: string) {
  return FROM_ENV[key]
}

let cachedKey: Buffer | undefined
/** Set once a check found no saved keys: only then may key() write a new key file. */
let mayCreateKey = false
let warned = false
const keyFile = () => dataDir('secret.key')
const hasSavedKeys = async () => !!(await db.select({ id: schema.connections.id }).from(schema.connections)
  .where(isNotNull(schema.connections.secretsEncrypted)).limit(1))[0]

/**
 * Why the key can't be used, or null. A missing key file next to saved keys means the data folder was lost or moved;
 * making a new key then would silently turn every saved key into "not saved", so key() refuses to create one until a
 * check found nothing saved. `hasSaved` and `file` are injectable for tests.
 */
export async function keyProblem(hasSaved = hasSavedKeys, file = keyFile()): Promise<string | null> {
  if (cachedKey || process.env.RELIFE_SECRET_KEY || existsSync(file)) return null
  if (await hasSaved()) {
    return `Saved connector keys exist, but their encryption key ${file} is missing. Restore it from a backup (or set RELIFE_SECRET_KEY / RELIFE_DATA_DIR to where it is). ReLife will not create a new key: it would make every saved key unreadable.`
  }
  mayCreateKey = true
  return null
}

/** Before writing encrypted keys: throws keyProblem()'s message. */
export async function assertKeyReady(hasSaved = hasSavedKeys, file = keyFile()) {
  const problem = await keyProblem(hasSaved, file)
  if (problem) throw new Error(problem)
}
/**
 * Creates `secret.key` now, from the one-shot `migrate` container, so the web app and the worker never race to make it.
 * Keeps the guard: with saved keys and no key file it throws instead of making a new key.
 */
export async function ensureKeyFile() {
  await assertKeyReady()
  key()
}

function key() {
  if (cachedKey) return cachedKey
  const fromEnv = process.env.RELIFE_SECRET_KEY
  if (fromEnv) {
    const k = Buffer.from(fromEnv, 'base64')
    if (k.length !== 32) throw new Error('RELIFE_SECRET_KEY must be 32 bytes, base64 encoded')
    return (cachedKey = k)
  }
  const file = keyFile()
  if (!existsSync(file)) {
    if (!mayCreateKey) throw new Error(`${file} is missing`)
    mkdirSync(dataDir(), { recursive: true })
    // The worker and the web app can both get here on first run: 'wx' lets one win, the other reads its key.
    try {
      writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
  const k = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
  // Read too early (the other process hasn't written yet) or a damaged file: never encrypt with a short key.
  if (k.length !== 32) throw new Error(`${file} must hold a 32-byte base64 key`)
  return (cachedKey = k)
}

export function encrypt(values: Record<string, string>): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(JSON.stringify(values), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body])
}

export function decrypt(buf: Buffer): Record<string, string> {
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'))
}

function stored(row: { secretsEncrypted: Buffer | null }) {
  if (!row.secretsEncrypted) return {}
  try { return decrypt(row.secretsEncrypted) } catch { return {} } // wrong key: treat as not saved
}

/**
 * Load what a person connected into their key map, read by env() while code runs as them. Integrations that aren't
 * connected read as unset, even when .env has them; .env values only fill blanks for connected ones, and only for the
 * owner (the .env is the server's: it must not hand a member the owner's own Binance key). Instance keys are not loaded
 * here: they come from the owner's connections (`applyInstanceSecrets`).
 */
export async function applySecrets(userId: string) {
  // A missing key must not take the app down: saved keys read as not saved (connections fall back to .env), and
  // Connect explains the problem. Logged once.
  const problem = await keyProblem()
  if (problem && !warned) { warned = true; console.error('[secrets]', problem) }
  const owner = await ownerId()
  const mine = userId === owner || !owner
  const rows = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.enabled, true)))
    .orderBy(asc(schema.connections.updatedAt)) // later connections win shared keys like LLM_DEFAULT
  const keys = new Map<string, string | undefined>(MANAGED_ENV.filter((k) => !isInstanceKey(k)).map((k) => [k, undefined]))
  for (const row of rows) {
    const spec = integration(row.connectorId)
    if (!spec) continue
    const saved = stored(row)
    for (const k of new Set([...spec.required, ...spec.fields.map((f) => f.env)])) {
      if (isInstanceKey(k)) continue
      const v = saved[k] || (mine ? FROM_ENV[k] : undefined)
      if (v) keys.set(k, v)
    }
  }
  setUserKeys(userId, keys)
  // The owner's own save may have changed a server key (an AI key): make it count at once in this process.
  if (mine) await applyInstanceSecrets()
  // Saved tokens are unreadable without the key: syncing now would delete the legacy device rows (and forget a
  // revocation, so restoring the key would bring a revoked token back).
  if (!problem) await syncLegacyOnce(userId)
}

/** The server's keys, from the owner's connections: AI providers, the Telegram bot token and OAuth app credentials. */
export async function applyInstanceSecrets() {
  const owner = await ownerId()
  const keys = new Map<string, string | undefined>(INSTANCE_ENV.map((k) => [k, undefined]))
  if (owner) {
    const rows = await db.select().from(schema.connections)
      .where(and(eq(schema.connections.userId, owner), eq(schema.connections.enabled, true)))
      .orderBy(asc(schema.connections.updatedAt))
    for (const row of rows) {
      const spec = integration(row.connectorId)
      if (!spec) continue
      const saved = stored(row)
      for (const k of new Set([...spec.required, ...spec.fields.map((f) => f.env)])) {
        if (!isInstanceKey(k)) continue
        const v = saved[k] || FROM_ENV[k]
        if (v) keys.set(k, v)
      }
    }
  }
  setInstanceKeys(keys, INSTANCE_ENV)
}

// ACTIVITY_TOKEN and INGEST_TOKEN become device rows (src/core/auth/devices.ts). Keys load often, so only a change is synced.
const legacySeen = new Map<string, string>()
async function syncLegacyOnce(userId: string) {
  const { envFor } = await import('./env')
  const get = (k: string) => envFor(userId, k)
  const fingerprint = `${userId}|${get('ACTIVITY_TOKEN') ?? ''}|${get('INGEST_TOKEN') ?? ''}`
  if (legacySeen.get(userId) === fingerprint) return
  await (await import('./auth/devices')).syncLegacyTokens(userId, get)
  legacySeen.set(userId, fingerprint)
}

/** Which fields already have a value, for the dialog. Secret values never leave the server. */
export async function savedFields(userId: string) {
  const rows = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId))
  return new Map(rows.map((r) => [r.connectorId, stored(r)]))
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/** Network trouble, not a wrong key: timeouts, refused connections, rate limits and server errors. */
export function isTransient(err: unknown) {
  if (!(err instanceof Error)) return false
  // fetch failed or timed out. Fails open: a TypeError from a bug in a check also lets the save through.
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err instanceof TypeError) return true
  // A 200 that isn't JSON: a captive portal or proxy page, not a wrong key.
  if (err instanceof SyntaxError) return true
  return /timed out|rate limit|HTTP 5\d\d|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(err.message)
}

const CHECK_TIMEOUT_MS = 15_000

/** Run a connector's key check. A problem the user can fix comes back as a message; anything transient passes. */
export async function checkKeys(check: NonNullable<Integration['check']>, get: (env: string) => string | undefined): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      check(get),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Check timed out'), { name: 'TimeoutError' })), CHECK_TIMEOUT_MS) }),
    ])
    return undefined
  } catch (err) {
    if (isTransient(err)) return undefined // can't tell now: save, and the first sync reports it
    return (err instanceof Error ? err.message : String(err)).slice(0, 300)
  } finally {
    clearTimeout(timer)
  }
}

/** One dialog value, cleaned the way it's saved. `error` when it can't be saved at all. */
function cleanField(id: string, f: SetupField, raw: unknown): { v?: string; error?: string } {
  let v = typeof raw === 'string' ? raw.trim() : ''
  if (!v) return {}
  if (v.length > 500 || /[\r\n]/.test(v)) return { error: `${f.label} doesn’t look right.` }
  if (f.env === 'LLM_DEFAULT' && !v.includes(':')) v = `${id}:${v}`
  if (f.env === 'TELEGRAM_ALLOWED_CHAT_ID' && !/^-?\d+$/.test(v)) return { error: 'Chat ID is a number, like 123456789.' }
  return { v }
}

/** Validate dialog input and connect. Blank fields keep the saved value or fall back to .env. */
export async function connect(userId: string, id: string, input: Record<string, unknown>): Promise<SaveResult> {
  const problem = await keyProblem()
  if (problem) return { ok: false, error: problem }
  const spec = integration(id)
  if (!spec) return { ok: false, error: 'Unknown connector.' }
  // Server keys (AI, the Telegram bot, an OAuth app) are the owner's to set; a member uses them, never writes them.
  const owner = await ownerId()
  const isOwner = !owner || owner === userId
  if (!isOwner && integrationScope(id) === 'instance') return { ok: false, error: 'This is set up by the person who runs this server.' }
  // Malformed input is refused before anything is sent to the service.
  const typed = new Map<string, string>()
  for (const f of spec.fields) {
    if (!isOwner && isInstanceKey(f.env)) continue
    const { v, error } = cleanField(id, f, input[f.env])
    if (error) return { ok: false, error }
    if (v) typed.set(f.env, v)
  }
  // Test the keys first (outside the lock: it's a network call), so a typo shows here, not as a failing sync later.
  if (spec.check) {
    const [row] = await db.select().from(schema.connections)
      .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
    const saved: Record<string, string> = row ? stored(row) : {}
    const get = (k: string) => typed.get(k) ?? saved[k] ?? (isInstanceKey(k) ? envFor(userId, k) : isOwner ? FROM_ENV[k] : undefined)
    // Missing required fields are reported below with a clearer message.
    if (spec.fields.every((f) => f.optional || get(f.env))) {
      const problem = await checkKeys(spec.check, get)
      if (problem) return { ok: false, error: problem }
    }
  }
  // Locked, so a token refresh saved by a sync at the same moment isn't overwritten with the old token.
  const result = await db.transaction(async (tx): Promise<SaveResult> => {
    const [row] = await tx.select().from(schema.connections)
      .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id))).for('update')
    const values: Record<string, string> = row ? stored(row) : {}
    // The app and pasted token in use before this save (saved, or from .env), to spot a change.
    const before = spec.oauth ? [spec.oauth.clientIdEnv, spec.oauth.refreshTokenEnv].map((k) => (k ? values[k] || FROM_ENV[k] : undefined)) : []
    for (const [k, v] of typed) values[k] = v
    // Tokens from one app don't work with another: a new client ID means signing in again. A newly pasted
    // refresh token replaces the sign-in, so setups without a browser can recover.
    if (spec.oauth) {
      const after = [spec.oauth.clientIdEnv, spec.oauth.refreshTokenEnv].map((k) => (k ? values[k] || FROM_ENV[k] : undefined))
      if (after.some((v, i) => v !== before[i])) delete values[OAUTH_KEY]
    }
    const missing = spec.fields.find((f) => !f.optional && !values[f.env] && !(isOwner ? FROM_ENV[f.env] : false) && !(!isOwner && isInstanceKey(f.env) && envFor(userId, f.env)))
    if (missing) return { ok: false, error: `Add your ${/^[A-Z][A-Z]/.test(missing.label) ? missing.label : missing.label[0].toLowerCase() + missing.label.slice(1)}.` }

    const patch = {
      enabled: true, status: 'never' as const, failures: 0, lastError: null,
      secretsEncrypted: Object.keys(values).length ? encrypt(values) : null,
    }
    await tx.insert(schema.connections).values({ userId, connectorId: id, ...patch })
      .onConflictDoUpdate({ target: [schema.connections.userId, schema.connections.connectorId], set: { ...patch, updatedAt: new Date() } })
    return { ok: true }
  })
  if (result.ok) await applySecrets(userId)
  return result
}

/** Disconnect and forget saved keys. Sync progress (cursor) is kept so reconnecting doesn't re-import. */
export async function disconnect(userId: string, id: string) {
  await db.update(schema.connections)
    // Strava used to keep its rotated refresh token in the cursor (`token`, `seed`): forget that too.
    .set({ enabled: false, status: 'disabled', secretsEncrypted: null, lastError: null, cursor: sql`${schema.connections.cursor} - 'token' - 'seed'` })
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
  await applySecrets(userId)
}

// ------------------------------------------------------------------------------------------- OAuth tokens

/** Saved next to the connection's keys, so Disconnect forgets them too. Never loaded into env(). */
const OAUTH_KEY = '__oauth'

export type OAuthTokens = { access: string; refresh?: string; expiresAt?: number }

export async function oauthTokens(userId: string, id: string): Promise<OAuthTokens | null> {
  const [row] = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
  const raw = row ? stored(row)[OAUTH_KEY] : undefined
  return raw ? (JSON.parse(raw) as OAuthTokens) : null
}

/** Locked against a dialog save; skipped when the connection was disconnected meanwhile, so a forget sticks. */
export async function saveOAuthTokens(userId: string, id: string, tokens: OAuthTokens) {
  await assertKeyReady()
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.connections)
      .where(and(
        eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id),
        eq(schema.connections.enabled, true), isNotNull(schema.connections.secretsEncrypted),
      )).for('update')
    if (!row) throw new Error('Connect it first.')
    const values = { ...stored(row), [OAUTH_KEY]: JSON.stringify(tokens) }
    await tx.update(schema.connections).set({ secretsEncrypted: encrypt(values), updatedAt: new Date() }).where(eq(schema.connections.id, row.id))
  })
}

/** Which connections have signed in, for the Connections page. */
export function signedIn(saved: Map<string, Record<string, string>>, id: string) {
  return !!saved.get(id)?.[OAUTH_KEY]
}
