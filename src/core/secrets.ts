import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { MANAGED_ENV, integration } from './integrations'
import { setKeys } from './env'

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
  const file = join(process.cwd(), 'data', 'secret.key')
  if (!existsSync(file)) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
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

/** Validate dialog input and connect. Blank fields keep the saved value or fall back to .env. */
export async function connect(userId: string, id: string, input: Record<string, unknown>): Promise<SaveResult> {
  const spec = integration(id)
  if (!spec) return { ok: false, error: 'Unknown connector.' }
  const [row] = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
  const values: Record<string, string> = row ? stored(row) : {}
  for (const f of spec.fields) {
    let v = typeof input[f.env] === 'string' ? (input[f.env] as string).trim() : ''
    if (!v) continue
    if (v.length > 500 || /[\r\n]/.test(v)) return { ok: false, error: `${f.label} doesn’t look right.` }
    if (f.env === 'LLM_DEFAULT' && !v.includes(':')) v = `${id}:${v}`
    if (f.env === 'TELEGRAM_ALLOWED_CHAT_ID' && !/^-?\d+$/.test(v)) return { ok: false, error: 'Chat ID is a number, like 123456789.' }
    values[f.env] = v
  }
  const missing = spec.fields.find((f) => !f.optional && !values[f.env] && !FROM_ENV[f.env])
  if (missing) return { ok: false, error: `Add your ${/^[A-Z][A-Z]/.test(missing.label) ? missing.label : missing.label[0].toLowerCase() + missing.label.slice(1)}.` }

  const patch = {
    enabled: true, status: 'never' as const, failures: 0, lastError: null,
    secretsEncrypted: Object.keys(values).length ? encrypt(values) : null,
  }
  await db.insert(schema.connections).values({ userId, connectorId: id, ...patch })
    .onConflictDoUpdate({ target: [schema.connections.userId, schema.connections.connectorId], set: { ...patch, updatedAt: new Date() } })
  await applySecrets(userId)
  return { ok: true }
}

/** Disconnect and forget saved keys. Sync progress (cursor) is kept so reconnecting doesn't re-import. */
export async function disconnect(userId: string, id: string) {
  await db.update(schema.connections)
    .set({ enabled: false, status: 'disabled', secretsEncrypted: null, lastError: null })
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.connectorId, id)))
  await applySecrets(userId)
}
