import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dataDir } from '../paths'

// Which encryption key protects the saved connector keys, without loading it into core/secrets.ts: a backup records a
// fingerprint of it so a restore can tell whether the key it will use opens the saved keys.

export type KeySource = 'env' | 'file' | 'none'

/** First 16 hex characters of sha256 of the key bytes: enough to compare, nothing to decrypt with. */
export const fingerprint = (base64: string) => createHash('sha256').update(Buffer.from(base64.trim(), 'base64')).digest('hex').slice(0, 16)

export const keyFilePath = () => dataDir('secret.key')

/** The key in effect now: RELIFE_SECRET_KEY, else the key file. */
export function currentKey(): { source: KeySource; fingerprint?: string } {
  const env = process.env.RELIFE_SECRET_KEY
  if (env) return { source: 'env', fingerprint: fingerprint(env) }
  if (existsSync(keyFilePath())) return { source: 'file', fingerprint: fingerprint(readFileSync(keyFilePath(), 'utf8')) }
  return { source: 'none' }
}
