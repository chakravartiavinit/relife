import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { MANAGED_ENV, integration, type Integration } from './integrations'
import { setKeys } from './env'
import type { SetupField } from './types'

// Keys typed into the Connect dialog are stored AES-256-GCM encrypted in connections.secrets_encrypted.
// The encryption key is RELIFE_SECRET_KEY (32 bytes, base64) or a file created on first use in data/.
//
// ponytail: one global key map (core/env.ts). Single user, so that is enough for connectors, the bot
// and the AI layer. Multi-user needs per-user lookups instead.

/** .env values. Blank dialog fields fall back to these. */
const FROM_ENV: Record<string, string | undefined> = Object.fromEntries(MANAGED_ENV.map((k) => [k, process.env[k] || undefined]))

export function envDefault(key: string) {
  return FROM_ENV[key]
}

let cachedKey: Buffer | undefined
function key() {
  if (cachedKey) return cachedKey
  const fromEnv = process.env.RELIFE_SECRET_KEY
  if (fromEnv) {
    const k = Buffer.from(fromEnv, 'base64')
    if (k.length !== 32) throw new Error('RELIFE_SECRET_KEY must be 32 bytes, base64 encoded')
    return (cachedKey = k)
  }
  const file = join(/* turbopackIgnore: true */ process.cwd(), 'data', 'secret.key')
  if (!existsSync(file)) {
    mkdirSync(join(/* turbopackIgnore: true */ process.cwd(), 'data'), { recursive: true })
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' })
  }
  return (cachedKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64'))
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
 * Load what the user connected into the key map read by env(). Integrations that aren't connected
 * read as unset, even when .env has them; .env values only fill blanks for connected ones.
 */
export async function applySecrets(userId: string) {
  const rows = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.enabled, true)))
    .orderBy(asc(schema.connections.updatedAt)) // later connections win shared keys like LLM_DEFAULT
  const keys = new Map<string, string | undefined>(MANAGED_ENV.map((k) => [k, undefined]))
  for (const row of rows) {
    const spec = integration(row.connectorId)
    if (!spec) continue
    const saved = stored(row)
    for (const k of new Set([...spec.required, ...spec.fields.map((f) => f.env)])) {
      const v = saved[k] || FROM_ENV[k]
      if (v) keys.set(k, v)
    }
  }
  setKeys(keys)
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
  const spec = integration(id)
  if (!spec) return { ok: false, error: 'Unknown connector.' }
  // Malformed input is refused before anything is sent to the service.
  const typed = new Map<string, string>()
  for (const f of spec.fields) {
    const { v, error } = cleanField(id, f, input[f.env])
    if (error) return { ok: false, error }
    if (v) typed.set(f.env, v)
  }
  // Test the keys first (outside the lock: it's a network call), so a typo shows here, not as a failing sync later.
  if (spec.check) {
    const [row] = await db.select().from(schema.connections)
      .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
    const saved: Record<string, string> = row ? stored(row) : {}
    const get = (k: string) => typed.get(k) ?? saved[k] ?? FROM_ENV[k]
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
    const missing = spec.fields.find((f) => !f.optional && !values[f.env] && !FROM_ENV[f.env])
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

/** Which connections have signed in, for the Connectors page. */
export function signedIn(saved: Map<string, Record<string, string>>, id: string) {
  return !!saved.get(id)?.[OAUTH_KEY]
}
