import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasModel, localAiDown, localAiMessage, localAiStatus, probeLocalAi } from './local'

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
const url = 'http://localhost:11434/v1'

test('hasModel treats a bare name as :latest', () => {
  assert.ok(hasModel(['llama3.2:latest'], 'llama3.2'))
  assert.ok(hasModel(['llama3.2'], 'llama3.2:latest'))
  assert.ok(hasModel(['qwen3:4b-instruct'], 'qwen3:4b-instruct'))
  assert.ok(!hasModel(['qwen3:8b'], 'qwen3:4b-instruct'))
})

test('probe reads OpenAI-style and Ollama-style lists', async () => {
  assert.deepEqual((await probeLocalAi(url, reply({ data: [{ id: 'a:1' }] }))).models, ['a:1'])
  assert.deepEqual((await probeLocalAi(url, reply({ models: [{ name: 'b:2' }] }))).models, ['b:2'])
  assert.equal((await probeLocalAi(url, reply({ data: [] }))).state, 'ok')
})

test('probe says down on a refused connection, an error status or a page that is not JSON', async () => {
  for (const f of [(async () => { throw new TypeError('fetch failed') }) as typeof fetch, reply({}, 500), (async () => new Response('<html>')) as typeof fetch]) {
    const p = await probeLocalAi(url, f)
    assert.equal(p.state, 'down')
    assert.deepEqual(p.models, [])
  }
})

test('the fix reads differently on this machine and in Compose', () => {
  assert.match(localAiMessage('down', url, 'qwen3:4b-instruct'), /ollama\.com.*ollama pull qwen3:4b-instruct/)
  assert.match(localAiMessage('down', 'http://ollama:11434/v1', 'qwen3:4b-instruct'), /docker compose --profile ai up -d/)
  assert.match(localAiMessage('no-model', url, 'qwen3:4b-instruct'), /ollama pull qwen3:4b-instruct/)
})

test('the probe refuses redirects, and two asks at once share one request', async () => {
  let seen: RequestInit | undefined
  await probeLocalAi(url, (async (_u, init) => { seen = init; return new Response('{"data":[]}') }) as typeof fetch)
  assert.equal(seen?.redirect, 'error')

  const real = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return new Response('{"data":[{"id":"m"}]}') }) as typeof fetch
  try {
    const [a, b] = await Promise.all([probeLocalAi(url), probeLocalAi(`${url}/`)])
    assert.deepEqual([a.models, b.models, calls], [['m'], ['m'], 1])
    await probeLocalAi(url)
    assert.equal(calls, 2, 'a probe after the first has finished asks again')
  } finally { globalThis.fetch = real }
})

test('localAiStatus: ok, the model missing, or nothing answering; not-local for a cloud model', async () => {
  const saved = process.env.LLM_DEFAULT
  const status = (fetchImpl: typeof fetch) => localAiStatus('chat', { fresh: true, fetchImpl })
  try {
    process.env.LLM_DEFAULT = 'local:qwen3:4b-instruct'
    assert.equal((await status(reply({ data: [{ id: 'qwen3:4b-instruct' }] }))).state, 'ok')
    assert.equal((await status(reply({ data: [{ id: 'qwen3' }] }))).state, 'no-model')
    const gone = await status((async () => { throw new TypeError('fetch failed') }) as typeof fetch)
    assert.ok(localAiDown(gone) && gone.state === 'down' && /docker compose --profile ai up -d|ollama\.com/.test(gone.message))
    assert.equal((await status(reply({}, 500))).state, 'down')
    process.env.LLM_DEFAULT = 'anthropic:claude'
    assert.equal((await status(reply({}))).state, 'not-local')
  } finally {
    if (saved === undefined) delete process.env.LLM_DEFAULT; else process.env.LLM_DEFAULT = saved
  }
})
