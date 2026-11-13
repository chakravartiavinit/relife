import assert from 'node:assert/strict'
import { test } from 'node:test'
import { anki } from './anki'

test('anki only talks to this computer or the home network, and never follows a redirect', async () => {
  const real = globalThis.fetch
  let called = 0
  let redirect: RequestRedirect | undefined
  globalThis.fetch = (async (_u: string, init: RequestInit) => { called++; redirect = init.redirect; return new Response(JSON.stringify({ result: 6, error: null })) }) as typeof fetch
  try {
    for (const url of ['http://8.8.8.8:8765', 'https://example.com', 'ftp://127.0.0.1', 'http://[2606:4700:4700::1111]']) {
      await assert.rejects(anki.check!((k) => (k === 'ANKI_CONNECT_URL' ? url : undefined)), /this computer or your home network|not AnkiConnect/, url)
    }
    assert.equal(called, 0, 'nothing was sent to a public address')
    for (const url of ['127.0.0.1:8765', 'http://192.168.1.5:8765', 'http://[::1]:8765']) await anki.check!((k) => (k === 'ANKI_CONNECT_URL' ? url : undefined))
    assert.equal(called, 3)
    assert.equal(redirect, 'error')
  } finally { globalThis.fetch = real }
})

test('anki does not say what answered at a wrong address', async () => {
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response('<html>secret router admin</html>', { status: 403 })) as typeof fetch
  try {
    await assert.rejects(anki.check!(() => undefined), (e: Error) => /not AnkiConnect/.test(e.message) && !/403|secret|router|127\.0\.0\.1/.test(e.message))
  } finally { globalThis.fetch = real }
})
