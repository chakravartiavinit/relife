import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchPublic, isLocalAddress, isPublicAddress, isLocalHost } from './safe-fetch'

test('only public internet addresses are public', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) assert.ok(isPublicAddress(ip), ip)
  for (const ip of ['127.0.0.1', '127.1.2.3', '10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.7', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', '[::1]', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:169.254.169.254', 'localhost', 'example.com', '']) assert.ok(!isPublicAddress(ip), ip)
  assert.ok(isPublicAddress('172.32.0.1') && isPublicAddress('100.128.0.1'), 'just outside the private ranges')
})

test('local addresses are this computer and its own network', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '100.101.102.103', '::1', 'fd12::1', '::ffff:192.168.1.1']) assert.ok(isLocalAddress(ip), ip)
  for (const ip of ['8.8.8.8', '2606:4700:4700::1111', 'example.com']) assert.ok(!isLocalAddress(ip), ip)
  assert.ok(await isLocalHost('127.0.0.1') && await isLocalHost('[::1]'))
  assert.ok(!(await isLocalHost('8.8.8.8')))
})

test('fetchPublic refuses anything that is not an https address on the public internet, without connecting', async () => {
  for (const url of ['https://127.0.0.1/x.png', 'https://[::1]/x.png', 'https://169.254.169.254/latest/meta-data', 'https://10.0.0.1/', 'http://8.8.8.8/x.png', 'file:///etc/passwd', 'https://[::ffff:127.0.0.1]/']) {
    assert.equal(await fetchPublic(url, { maxBytes: 1000, timeoutMs: 2000 }), null, url)
  }
  assert.equal(await fetchPublic('https://localhost/x.png', { maxBytes: 1000, timeoutMs: 2000 }), null, 'a name that resolves to loopback')
})
