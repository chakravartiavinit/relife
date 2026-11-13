import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedHost, hostName } from './hosts'

test('hostName drops the port and keeps IPv6 brackets', () => {
  assert.equal(hostName('127.0.0.1:3030'), '127.0.0.1')
  assert.equal(hostName('[::1]:3030'), '[::1]')
  assert.equal(hostName('Mac.Tail1234.TS.NET'), 'mac.tail1234.ts.net')
})

test('allowedHost lets loopback and Tailscale through and blocks rebinding domains', () => {
  for (const h of ['127.0.0.1:3030', 'localhost:3001', '[::1]:3030', 'mac.tail1234.ts.net']) assert.ok(allowedHost(h, ''), h)
  for (const h of [null, '', 'evil.example:3030', '127.0.0.1.evil.example', 'ts.net.evil.example', '10.0.0.5:3030']) assert.ok(!allowedHost(h, ''), String(h))
})

test('allowedHost reads extra names, with *. for subdomains', () => {
  assert.ok(allowedHost('relife.example.com', 'relife.example.com'))
  assert.ok(allowedHost('relife.example.com:443', ' other.dev , relife.example.com:443'))
  assert.ok(allowedHost('a.tunnel.example', '*.tunnel.example'))
  assert.ok(!allowedHost('tunnel.example', '*.tunnel.example'))
  assert.ok(!allowedHost('evil.example', 'relife.example.com'))
})
