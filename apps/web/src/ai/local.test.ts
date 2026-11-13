import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localAiStatus } from './local'

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
const url = 'http://ollama:11434/v1'

test('the server answers and has the model', async () => {
  const r = await localAiStatus(reply({ data: [{ id: 'qwen3:4b-instruct' }] }), { url, model: 'qwen3:4b-instruct' })
  assert.deepEqual(r, { ok: true, models: ['qwen3:4b-instruct'] })
})

test('a name with no tag matches :latest', async () => {
  assert.ok((await localAiStatus(reply({ data: [{ id: 'llama3.2:latest' }] }), { url, model: 'llama3.2' })).ok)
})

test('the server answers without the model', async () => {
  const r = await localAiStatus(reply({ data: [{ id: 'other:1b' }] }), { url, model: 'qwen3:4b-instruct' })
  assert.ok(!r.ok && r.reason === 'no-model' && r.message.includes('qwen3:4b-instruct') && r.message.includes(url))
})

test('nothing answers, or it answers with an error', async () => {
  for (const f of [(async () => { throw new TypeError('fetch failed') }) as typeof fetch, reply({}, 500)]) {
    const r = await localAiStatus(f, { url: `${url}/`, model: 'x' })
    assert.ok(!r.ok && r.reason === 'unreachable')
    assert.ok(r.message.includes(`at ${url} isn't answering`) && r.message.includes('docker compose --profile ai up -d') && r.message.includes('You → Connections'))
  }
})
