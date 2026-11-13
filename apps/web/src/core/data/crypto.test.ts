import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, truncateSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { decryptFile, encryptStream, isEncrypted } from './crypto'

const dir = mkdtempSync(join(tmpdir(), 'relife-crypto-'))
const plain = Buffer.concat(Array.from({ length: 50 }, (_, i) => Buffer.from(`line ${i} ${'x'.repeat(i * 7)}\n`)))
async function seal(name: string, data: Buffer, pass = 'correct horse') {
  const file = join(dir, name)
  await pipeline(Readable.from([data.subarray(0, 100), data.subarray(100)]), await encryptStream(pass), createWriteStream(file))
  return file
}
test.after(() => rmSync(dir, { recursive: true, force: true }))

test('a stream round trips and the file is marked', async () => {
  const file = await seal('a.enc', plain)
  assert.equal(await isEncrypted(file), true)
  assert.ok(!readFileSync(file).includes('line 3'), 'the plain text is not in the file')
  await decryptFile(file, join(dir, 'a.out'), 'correct horse')
  assert.deepEqual(readFileSync(join(dir, 'a.out')), plain)
})

test('an empty stream still round trips', async () => {
  const file = await seal('empty.enc', Buffer.alloc(0))
  await decryptFile(file, join(dir, 'empty.out'), 'correct horse')
  assert.equal(readFileSync(join(dir, 'empty.out')).length, 0)
})

test('a wrong passphrase fails and leaves no output', async () => {
  const file = await seal('b.enc', plain)
  await assert.rejects(decryptFile(file, join(dir, 'b.out'), 'wrong'), /Wrong passphrase/)
  assert.equal(existsSync(join(dir, 'b.out')), false)
})

test('a truncated or edited file fails', async () => {
  const file = await seal('c.enc', plain)
  const bytes = readFileSync(file)
  truncateSync(file, bytes.length - 40)
  await assert.rejects(decryptFile(file, join(dir, 'c.out'), 'correct horse'), /Wrong passphrase|cut short/)
  const flipped = join(dir, 'd.enc')
  const copy = Buffer.from(bytes)
  copy[100] ^= 1
  writeFileSync(flipped, copy)
  await assert.rejects(decryptFile(flipped, join(dir, 'd.out'), 'correct horse'), /Wrong passphrase/)
  writeFileSync(join(dir, 'tiny.enc'), 'RLBK1\n')
  await assert.rejects(decryptFile(join(dir, 'tiny.enc'), join(dir, 'tiny.out'), 'x'), /cut short/)
})

test('a plain file is not an encrypted backup', async () => {
  writeFileSync(join(dir, 'plain.tar.gz'), Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 0]))
  assert.equal(await isEncrypted(join(dir, 'plain.tar.gz')), false)
  await assert.rejects(decryptFile(join(dir, 'plain.tar.gz'), join(dir, 'p.out'), 'x'), /cut short|not an encrypted/)
})
