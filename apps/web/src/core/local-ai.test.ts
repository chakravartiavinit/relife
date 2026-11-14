import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasModel, localAiMessage, probeLocalAi } from './local-ai'

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
