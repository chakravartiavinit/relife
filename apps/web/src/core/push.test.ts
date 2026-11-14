import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

// The real VAPID key file and the real web-push transport, with nothing mocked: the keys go to a temporary data folder, and
// the transport talks to a local https server standing in for a push service (a self-signed certificate made by openssl).
// '@/db' only connects on its first query, so a placeholder URL is enough to import src/core/push.ts here.
process.env.DATABASE_URL ??= 'postgres://relife:relife@127.0.0.1:1/relife'
delete process.env.RELIFE_VAPID_PUBLIC_KEY
delete process.env.RELIFE_VAPID_PRIVATE_KEY

const dir = mkdtempSync(join(tmpdir(), 'relife-push-'))
process.env.RELIFE_DATA_DIR = dir
const tlsWas = process.env.NODE_TLS_REJECT_UNAUTHORIZED
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let push: typeof import('./push')
test.before(async () => { push = await import('./push') })
test.after(() => {
  rmSync(dir, { recursive: true, force: true })
  if (tlsWas === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsWas
})

test('vapidKeys makes a P-256 key pair on first use, keeps it in data/vapid.json (0600) and gives the same pair again', () => {
  const k = push.vapidKeys()
  assert.equal(Buffer.from(k.publicKey, 'base64url').length, 65, 'an uncompressed P-256 point')
  assert.equal(Buffer.from(k.privateKey, 'base64url').length, 32)
  const file = join(dir, 'vapid.json')
  assert.ok(existsSync(file))
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), k)
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.deepEqual(push.vapidKeys(), k)
})

test('the transport sends an encrypted, VAPID-signed message: a 201 resolves, a 410 rejects with its status, a 500 too', async () => {
  const cert = join(dir, 'c.pem'), key = join(dir, 'k.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' })
  const seen: { path: string; headers: Record<string, string | string[] | undefined>; bytes: number }[] = []
  const server = createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      seen.push({ path: req.url ?? '', headers: req.headers, bytes: Buffer.concat(chunks).length })
      res.statusCode = req.url?.endsWith('/gone') ? 410 : req.url?.endsWith('/busy') ? 500 : 201
      res.end(res.statusCode === 201 ? '' : 'no')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    const base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
    const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
    const sub = (path: string) => ({ endpoint: `${base}${path}`, p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') }) as never

    await push.webPushTransport(sub('/ok'), JSON.stringify({ title: 'Vitamin D' }), { ttl: 3600, urgency: 'high' })
    const h = seen[0].headers
    assert.equal(h.ttl, '3600')
    assert.equal(h.urgency, 'high')
    assert.match(String(h.authorization), /^vapid /)
    assert.equal(h['content-encoding'], 'aes128gcm')
    assert.ok(seen[0].bytes > 30, 'the body is the encrypted payload')

    await assert.rejects(push.webPushTransport(sub('/gone'), '{}', { ttl: 60, urgency: 'normal' }), (e: { statusCode?: number }) => e.statusCode === 410)
    await assert.rejects(push.webPushTransport(sub('/busy'), '{}', { ttl: 60, urgency: 'normal' }), (e: { statusCode?: number }) => e.statusCode === 500)
  } finally {
    await new Promise((r) => server.close(r))
  }
})
