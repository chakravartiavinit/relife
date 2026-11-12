import { createHash, createHmac, randomBytes } from 'node:crypto'

// No 0/O/1/I so a code read aloud or typed from a screenshot survives.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** The /w/<token> secret. Only its hash is stored. */
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** 8 public characters for ?ref= (32^8 values, uniform because 256 % 32 == 0). */
export function newRefCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export function secret(): string {
  const s = process.env.WAITLIST_SECRET
  if (s) return s
  // Required in every production run, including a local preview build (SITE_ALLOW_UNREADY_BRAND does not relax it).
  if (process.env.NODE_ENV === 'production') throw new Error('WAITLIST_SECRET is not set')
  return 'dev-only-waitlist-secret'
}

/** HMAC of an IP or email, so the database never holds either in the clear for rate limiting. */
export const hmac = (value: string, key = secret()) => createHmac('sha256', key).update(value).digest('hex')
