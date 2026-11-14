import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultReach, reachOptions, type ReachInput, type ReachOption } from './reach'

const base: ReachInput = {
  host: '127.0.0.1:3030', origin: null, port: 3030, bind: '127.0.0.1', lanIps: ['192.168.1.20'],
  tailscale: { name: null, serving: false }, inDocker: false,
}
const opts = (o: Partial<ReachInput> = {}) => reachOptions({ ...base, ...o })
const get = (list: ReachOption[], id: ReachOption['id']) => list.find((o) => o.id === id)

test('a fresh laptop on loopback: nothing is ready, and the LAN and public options say what to change', () => {
  const list = opts()
  assert.deepEqual(list.map((o) => o.id), ['tailscale', 'lan', 'public'])
  assert.equal(defaultReach(list), null, 'no QR until one is ready')
  assert.equal(get(list, 'tailscale')!.state, 'unavailable')
  const lan = get(list, 'lan')!
  assert.equal(lan.state, 'needs-setup')
  assert.equal(lan.url, 'http://192.168.1.20:3030')
  assert.equal(lan.https, false)
  assert.deepEqual(lan.fixes[0].envLines, ['RELIFE_BIND=0.0.0.0', 'RELIFE_ALLOWED_HOSTS=192.168.1.20'])
  assert.ok(lan.fixes[0].notes!.some((n) => /trust this Mac/.test(n)) && lan.fixes[0].notes!.some((n) => /plain http/.test(n)) && lan.fixes[0].notes!.some((n) => /NEXT_ALLOWED_DEV_ORIGINS/.test(n)))
  assert.equal(get(list, 'public')!.state, 'unavailable')
})

test('the LAN option is ready only when the server listens beyond loopback and allows the address', () => {
  assert.equal(get(opts({ bind: '0.0.0.0' }), 'lan')!.state, 'needs-setup', 'listening wide but the host is not allowed')
  assert.equal(get(opts({ bind: '0.0.0.0', allowedHosts: '192.168.1.20' }), 'lan')!.state, 'ready')
  assert.equal(get(opts({ bind: '127.0.0.1', allowedHosts: '192.168.1.20' }), 'lan')!.state, 'needs-setup', 'allowed but loopback-only')
  assert.equal(get(opts({ bind: '0.0.0.0', allowedHosts: '*.example.com, 192.168.1.20' }), 'lan')!.state, 'ready', 'one of several')
  assert.equal(get(opts({ bind: '127.0.0.1', hostname: '0.0.0.0' }), 'lan')!.state, 'needs-setup', 'HOSTNAME=0.0.0.0 widens, but the address is still not allowed')
})

test('the LAN fix keeps the hosts already allowed and lists every address', () => {
  const lan = get(opts({ lanIps: ['192.168.1.20', '10.0.0.5'], allowedHosts: 'relife.example.com' }), 'lan')!
  assert.deepEqual(lan.addresses, ['192.168.1.20', '10.0.0.5'])
  assert.deepEqual(lan.fixes[0].envLines, ['RELIFE_BIND=0.0.0.0', 'RELIFE_ALLOWED_HOSTS=relife.example.com,192.168.1.20,10.0.0.5'])
})

test('no network address at all', () => {
  const lan = get(opts({ lanIps: [] }), 'lan')!
  assert.equal(lan.state, 'unavailable')
  assert.equal(lan.url, null)
})

test('in Docker the LAN option never shows the container address and points at RELIFE_PUBLIC_URL', () => {
  const lan = get(opts({ inDocker: true, lanIps: ['172.18.0.3'], bind: '0.0.0.0' }), 'lan')!
  assert.equal(lan.url, null)
  assert.equal(lan.state, 'needs-setup')
  assert.ok(lan.fixes[0].envLines!.some((l) => l.startsWith('RELIFE_PUBLIC_URL=')))
  assert.ok(!JSON.stringify(lan).includes('172.18'))
  assert.match(get(opts({ inDocker: true }), 'tailscale')!.fixes[0].label, /no Tailscale/)
})

test('Tailscale: needs serve, then ready when serving, and ready when the page is already on a ts.net name', () => {
  const ts = { name: 'mac.tail1.ts.net', serving: false }
  const off = get(opts({ tailscale: ts }), 'tailscale')!
  assert.equal(off.state, 'needs-setup')
  assert.equal(off.url, 'https://mac.tail1.ts.net')
  assert.equal(off.fixes[0].command, 'tailscale serve --bg 3030')
  assert.equal(get(opts({ tailscale: { ...ts, serving: true } }), 'tailscale')!.state, 'ready')
  assert.equal(get(opts({ host: 'mac.tail1.ts.net', origin: 'https://mac.tail1.ts.net', tailscale: ts }), 'origin')!.state, 'ready')
  assert.equal(get(opts({ tailscale: ts, port: 3134 }), 'tailscale')!.fixes[0].command, 'tailscale serve --bg 3134', 'the port comes from the request')
})

test('the page\'s own address is listed once, as "origin"', () => {
  const list = opts({ host: 'mac.tail1.ts.net', origin: 'https://mac.tail1.ts.net', tailscale: { name: 'mac.tail1.ts.net', serving: true } })
  assert.deepEqual(list.map((o) => o.id), ['origin', 'lan', 'public'])
  assert.equal(defaultReach(list)!.id, 'origin')
  const lanOrigin = opts({ host: '192.168.1.20:3030', origin: 'http://192.168.1.20:3030', bind: '0.0.0.0', allowedHosts: '192.168.1.20' })
  assert.deepEqual(lanOrigin.map((o) => o.id), ['origin', 'tailscale', 'public'], 'the LAN option is the origin')
  assert.equal(get(lanOrigin, 'origin')!.https, false)
})

test('RELIFE_PUBLIC_URL: ready when its host is allowed, else it says which line to add', () => {
  const needs = get(opts({ publicUrl: 'https://relife.example.com/', allowedHosts: '*.other.org' }), 'public')!
  assert.equal(needs.url, 'https://relife.example.com')
  assert.equal(needs.state, 'needs-setup')
  assert.deepEqual(needs.fixes[0].envLines, ['RELIFE_ALLOWED_HOSTS=*.other.org,relife.example.com'])
  assert.equal(get(opts({ publicUrl: 'https://relife.example.com', allowedHosts: 'relife.example.com' }), 'public')!.state, 'ready')
  assert.equal(get(opts({ publicUrl: 'https://relife.example.com', allowedHosts: '*.example.com' }), 'public')!.state, 'ready', 'a wildcard allows it')
  assert.equal(get(opts({ publicUrl: 'https://box.tail1.ts.net' }), 'public')!.state, 'ready', 'ts.net is always allowed')
  assert.equal(get(opts({ publicUrl: 'not a url' }), 'public')!.state, 'unavailable')
  assert.equal(get(opts({ publicUrl: 'http://box.example.com:8080', allowedHosts: 'box.example.com' }), 'public')!.https, false)
})

test('the default choice: origin, then Tailscale, then public https, then the local network', () => {
  const ts = { name: 'mac.tail1.ts.net', serving: true }
  const all = { bind: '0.0.0.0', allowedHosts: '192.168.1.20,relife.example.com', publicUrl: 'https://relife.example.com' }
  assert.equal(defaultReach(opts({ ...all, tailscale: ts }))!.id, 'tailscale')
  assert.equal(defaultReach(opts(all))!.id, 'public')
  assert.equal(defaultReach(opts({ ...all, publicUrl: undefined }))!.id, 'lan')
  assert.equal(defaultReach(opts({ ...all, publicUrl: 'http://relife.example.com' }))!.id, 'lan', 'plain http public ranks below the LAN')
  assert.equal(defaultReach(opts({ ...all, host: '192.168.1.20:3030', origin: 'http://192.168.1.20:3030' }))!.id, 'origin')
})
