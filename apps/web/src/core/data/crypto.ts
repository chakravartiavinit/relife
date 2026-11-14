import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import brand from '@relife/brand/brand.json'

// Encrypted backups: `RLBK1\n` + salt(16) + iv(12) + AES-256-GCM ciphertext + tag(16). The key is scrypt(passphrase, salt).
// A lost passphrase is a lost backup: there is no way around it.

const MAGIC = Buffer.from('RLBK1\n')
const HEADER = MAGIC.length + 16 + 12
const TAG = 16
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

const derive = (pass: string, salt: Buffer) =>
  new Promise<Buffer>((ok, fail) => scrypt(pass, salt, 32, SCRYPT, (e, k) => (e ? fail(e) : ok(k))))

/** A transform that turns a plain stream into the encrypted file format. */
export async function encryptStream(pass: string): Promise<Transform> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await derive(pass, salt), iv)
  let first = true
  return new Transform({
    transform(chunk, _enc, done) {
      const out = cipher.update(chunk)
      done(null, first ? (first = false, Buffer.concat([MAGIC, salt, iv, out])) : out)
    },
    flush(done) {
      const head = first ? Buffer.concat([MAGIC, salt, iv]) : Buffer.alloc(0)
      done(null, Buffer.concat([head, cipher.final(), cipher.getAuthTag()]))
    },
  })
}

/** Whether a file starts with the encrypted-backup marker. */
export async function isEncrypted(file: string): Promise<boolean> {
  const fh = await open(file, 'r')
  try {
    const b = Buffer.alloc(MAGIC.length)
    const { bytesRead } = await fh.read(b, 0, b.length, 0)
    return bytesRead === b.length && b.equals(MAGIC)
  } finally { await fh.close() }
}

/** Decrypt `from` into `to`. Throws when the passphrase is wrong or the file is damaged or cut short; `to` is removed then. */
export async function decryptFile(from: string, to: string, pass: string): Promise<void> {
  const fh = await open(from, 'r')
  let head: Buffer, tag: Buffer, size: number
  try {
    size = (await fh.stat()).size
    if (size < HEADER + TAG) throw new Error('This backup is cut short.')
    head = Buffer.alloc(HEADER)
    await fh.read(head, 0, HEADER, 0)
    tag = Buffer.alloc(TAG)
    await fh.read(tag, 0, TAG, size - TAG)
  } finally { await fh.close() }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error(`This is not an encrypted ${brand.name} backup.`)
  const salt = head.subarray(MAGIC.length, MAGIC.length + 16)
  const iv = head.subarray(MAGIC.length + 16)
  const decipher = createDecipheriv('aes-256-gcm', await derive(pass, salt), iv)
  decipher.setAuthTag(tag)
  try {
    const body = size - TAG === HEADER ? Readable.from([]) : createReadStream(from, { start: HEADER, end: size - TAG - 1 })
    await pipeline(body, decipher, createWriteStream(to, { mode: 0o600 }))
  } catch (e) {
    await rm(to, { force: true })
    if (/auth|unable to authenticate/i.test(String((e as Error).message))) throw new Error('Wrong passphrase, or the backup is damaged.')
    throw e
  }
}
