import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromePath } from './browser'
import { shopConnectors } from './index'

/** Runs with CHROME_PATH set to `value` (undefined = unset). */
async function withChrome<T>(value: string | undefined, run: () => T | Promise<T>) {
  const old = process.env.CHROME_PATH
  if (value === undefined) delete process.env.CHROME_PATH
  else process.env.CHROME_PATH = value
  try { return await run() } finally { if (old === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = old }
}

test('chromePath says how to fix a CHROME_PATH that points nowhere', async () => {
  await withChrome('/var/tmp/no-such-chrome', () => assert.throws(() => chromePath(), /CHROME_PATH \(\/var\/tmp\/no-such-chrome\) isn’t there/))
})

test('chromePath uses CHROME_PATH when the file exists', async () => {
  await withChrome(process.execPath, () => assert.equal(chromePath(), process.execPath))
})

test('every shop connector checks Chrome and a pasted order page before connecting', async () => {
  for (const c of shopConnectors) {
    assert.ok(c.check, c.id)
    const key = c.fields[0].env
    await withChrome('/var/tmp/no-such-chrome', () => assert.rejects(c.check!(() => undefined), /CHROME_PATH/))
    await withChrome(process.execPath, async () => {
      await c.check!(() => undefined)
      const own = new URL(c.fields[0].placeholder!)
      const site = own.hostname.split('.').slice(-2).join('.')
      await c.check!((k) => (k === key ? `${own.origin}/moved` : undefined))
      await c.check!((k) => (k === key ? `https://m.${site}/orders` : undefined))
      for (const other of ['https://example.com/orders', `https://${site}.evil.example/`, `https://not${site}/`, 'http://127.0.0.1:3030/']) {
        await assert.rejects(c.check!((k) => (k === key ? other : undefined)), /own site/, other)
      }
      await assert.rejects(c.check!((k) => (k === key ? 'not a link' : undefined)), /isn’t a web address/)
      await assert.rejects(c.check!((k) => (k === key ? 'javascript:alert(1)' : undefined)), /isn’t a web address/)
    })
  }
})
