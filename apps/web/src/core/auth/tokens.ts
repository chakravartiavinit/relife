import { createHash, randomBytes, randomInt } from 'node:crypto'
import type { DeviceKind } from '@relife/contract'

// Opaque random tokens and codes. Only sha256 hashes are stored; the plain value is shown to the client once.

const LETTER: Record<DeviceKind, string> = { browser: 'b', phone: 'p', mac: 'm', extension: 'e', cli: 'c' }

/** `rlf_<kind letter>_<32 random bytes, base64url>`. The prefix makes a leak easy to spot (the pre-commit hook blocks it). */
export function makeToken(kind: DeviceKind) {
  const token = `rlf_${LETTER[kind]}_${randomBytes(32).toString('base64url')}`
  return { token, hash: hashToken(token) }
}

/** Plain sha256 is enough: the input is 256 random bits, so there is nothing to brute-force. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest()

/** A 32-byte secret for a QR link or a poll. */
export const newSecret = () => randomBytes(32).toString('base64url')

// Crockford base32 without the look-alikes: no 0/O, 1/I/L or U. 30 symbols, 8 of them is about 39 bits.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 8

export function newCode() {
  let c = ''
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return c
}

/** What people type: any case, with or without the dash or spaces. Characters outside the alphabet never match a stored code. */
export const normalizeCode = (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, '')

export const isCode = (input: string) => input.length === CODE_LENGTH && [...input].every((ch) => CODE_ALPHABET.includes(ch))

/** `K7FQ2M9X` → `K7FQ-2M9X`. */
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`
