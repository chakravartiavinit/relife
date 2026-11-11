import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchJson, pastedName } from './daily'
import { wakatime } from './wakatime'
import { todoist } from './todoist'
import { toggl } from './toggl'
import { rescuetime } from './rescuetime'
import { readwise } from './readwise'
import { lastfm } from './lastfm'
import { steam } from './steam'
import { duolingo } from './duolingo'
import { letterboxd } from './letterboxd'
import { openlibrary } from './openlibrary'
import { anki } from './anki'

// The Connect dialog's key check (Connector.check): a wrong key or name comes back as advice, a closed Anki passes.

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
async function withFetch<T>(handler: Handler, run: () => Promise<T>) {
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => handler(String(url), init)) as typeof fetch
  try { return await run() } finally { globalThis.fetch = real }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const keys = (m: Record<string, string>) => (k: string) => m[k]

test('pastedName takes the name from a bare name, an @name or a profile link', () => {
  assert.equal(pastedName(' @rj ', 'user'), 'rj')
  assert.equal(pastedName('https://www.last.fm/user/rj/library?x=1', 'user'), 'rj')
  assert.equal(pastedName('last.fm/user/rj', 'user'), 'rj')
  assert.equal(pastedName('https://www.duolingo.com/profile/luis', 'profile'), 'luis')
  assert.equal(pastedName('steamcommunity.com/id/gaben/', 'id'), 'gaben')
  assert.equal(pastedName('https://letterboxd.com/dave/films/', 'letterboxd.com'), 'dave')
  assert.equal(pastedName('openlibrary.org/people/mekBot', 'people'), 'mekBot')
})

test('fetchJson says "timed out" and "Network problem" so a check or sync treats them as try-again-later', async () => {
  await withFetch(() => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }) },
    () => assert.rejects(fetchJson('https://example.com/x'), /example\.com timed out/))
  await withFetch(() => { throw new TypeError('fetch failed') },
    () => assert.rejects(fetchJson('https://example.com/x'), /Network problem/))
  await withFetch(() => json({}, 429), () => assert.rejects(fetchJson('https://example.com/x'), /Rate limited/))
  await withFetch(() => new Response(null, { status: 204 }), async () => assert.equal(await fetchJson('https://example.com/x'), undefined))
})

test('a key check passes a good key and names the service for a rejected one', async () => {
  for (const [c, field, host, advice] of [
    [wakatime, 'WAKATIME_API_KEY', 'wakatime.com', /WakaTime rejected/], [todoist, 'TODOIST_API_TOKEN', 'todoist.com', /Todoist rejected/],
    [toggl, 'TOGGL_API_TOKEN', 'toggl.com', /Toggl rejected/], [readwise, 'READWISE_TOKEN', 'readwise.io', /Readwise rejected/],
  ] as const) {
    const seen: string[] = []
    const get = keys({ [field]: ' key ' })
    await withFetch((url, init) => { seen.push(`${new URL(url).host} ${(init.headers as Record<string, string>).Authorization}`); return json({}, 200) }, () => c.check!(get))
    assert.match(seen[0], new RegExp(host), c.id)
    assert.ok(!/key {2}| $/.test(seen[0]), `${c.id} trims the key`)
    await withFetch(() => json({}, 401), () => assert.rejects(c.check!(get), advice))
  }
  await withFetch(() => new Response(null, { status: 204 }), () => readwise.check!(keys({ READWISE_TOKEN: 'k' }))) // Readwise answers 204
})

test('RescueTime answers a wrong key with HTTP 400, which the check words as advice', async () => {
  await withFetch(() => json({ error: '# key not found' }, 400), () => assert.rejects(rescuetime.check!(keys({ RESCUETIME_API_KEY: 'k' })), /RescueTime did not accept/))
})

test('Last.fm check reads the error code in the body, even on a 403', async () => {
  const get = keys({ LASTFM_USERNAME: 'https://www.last.fm/user/rj/', LASTFM_API_KEY: 'k' })
  let user: string | null = null
  await withFetch((url) => { user = new URL(url).searchParams.get('user'); return json({ recenttracks: { track: [], '@attr': { totalPages: '1' } } }) }, () => lastfm.check!(get))
  assert.equal(user, 'rj')
  await withFetch(() => json({ error: 10, message: 'Invalid API key' }, 403), () => assert.rejects(lastfm.check!(get), /rejected the API key/))
  await withFetch(() => json({ error: 6, message: 'User not found' }, 404), () => assert.rejects(lastfm.check!(get), /user not found/i))
  await withFetch(() => json({ error: 17, message: 'Login: User required to be logged in' }, 403), () => assert.rejects(lastfm.check!(get), /Hide recent listening/))
})

test('Steam check resolves a profile name and tells a private profile from a wrong key', async () => {
  const get = keys({ STEAM_API_KEY: 'k', STEAM_ID: 'https://steamcommunity.com/id/gaben/' })
  const urls: string[] = []
  await withFetch((url) => {
    urls.push(url)
    return url.includes('ResolveVanityURL') ? json({ response: { success: 1, steamid: '76561197960287930' } }) : json({ response: { game_count: 2, games: [{ appid: 1, playtime_forever: 5 }] } })
  }, () => steam.check!(get))
  assert.match(urls[0], /vanityurl=gaben(&|$)/)
  assert.match(urls[1], /steamid=76561197960287930/)
  await withFetch(() => json({ response: {} }), () => assert.rejects(steam.check!(keys({ STEAM_API_KEY: 'k', STEAM_ID: '76561197960287930' })), /Game details to Public/))
  await withFetch(() => new Response('Forbidden', { status: 403 }), () => assert.rejects(steam.check!(get), /Steam rejected the Web API key/))
})

test('public-name checks say what is wrong with the name', async () => {
  await withFetch(() => json({ users: [] }), () => assert.rejects(duolingo.check!(keys({ DUOLINGO_USERNAME: 'nobody' })), /Username not found/))
  await withFetch(() => json({ users: [{ totalXp: 5, streak: 1 }] }), () => duolingo.check!(keys({ DUOLINGO_USERNAME: 'luis' })))
  await withFetch(() => new Response('', { status: 404 }), () => assert.rejects(letterboxd.check!(keys({ LETTERBOXD_USERNAME: 'nobody' })), /not found, or the profile is private/))
  await withFetch(() => new Response('<rss></rss>', { status: 200 }), () => letterboxd.check!(keys({ LETTERBOXD_USERNAME: 'https://letterboxd.com/dave/' })))
  await withFetch(() => json({ detail: 'This reading log is private' }, 403), () => assert.rejects(openlibrary.check!(keys({ OPENLIBRARY_USERNAME: 'x' })), /Reading Log/))
  await withFetch(() => json({ page: 1, numFound: 0, reading_log_entries: [] }), () => openlibrary.check!(keys({ OPENLIBRARY_USERNAME: '@mekBot' })))
})

test('Anki check passes when Anki is closed, and fails for a wrong address or key', async () => {
  await withFetch(() => { throw new TypeError('fetch failed') }, () => anki.check!(keys({}))) // closed: save anyway
  await withFetch(() => json({ result: 6, error: null }), () => anki.check!(keys({})))
  await withFetch(() => json({ result: null, error: 'valid api key must be provided' }), () => assert.rejects(anki.check!(keys({})), /rejected the key/))
  await withFetch(() => new Response('<html></html>', { status: 200 }), () => assert.rejects(anki.check!(keys({ ANKI_CONNECT_URL: 'localhost:9' })), /not AnkiConnect/))
  let url = ''
  await withFetch((u) => { url = u; return json({ result: 6, error: null }) }, () => anki.check!(keys({ ANKI_CONNECT_URL: 'localhost:8765/' })))
  assert.equal(url, 'http://localhost:8765')
})

const ctxFor = (cursor: unknown = null) => {
  const events: { externalId: string; body: unknown }[] = []
  let saved: unknown
  return { events, saved: () => saved, ctx: { user: { timezone: 'Asia/Kolkata' } as never, cursor, setCursor: (c: unknown) => { saved = c }, emit: async (e: never) => { events.push(e) }, log: () => {} } }
}

test('Toggl asks a month at a time on the first sync, and never reaches past its 3-month limit', async () => {
  const { setKeys } = await import('@/core/env')
  setKeys(new Map([['TOGGL_API_TOKEN', 'k']]))
  const starts: string[] = []
  const { ctx } = ctxFor()
  await withFetch((url) => { starts.push(new URL(url).searchParams.get('start_date')!); return json([]) }, () => toggl.sync(ctx))
  assert.ok(starts.length >= 3, `${starts.length} requests`)
  const first = new Date(starts[0]).getTime()
  assert.ok((Date.now() - first) / 86_400_000 < 89, 'oldest start is under 3 months back')
})

test('Todoist reads the v1 answer (`items`) and pages by next_cursor', async () => {
  const { setKeys } = await import('@/core/env')
  setKeys(new Map([['TODOIST_API_TOKEN', 'k']]))
  const { ctx, events } = ctxFor({ backfilled: true })
  const today = new Date().toISOString()
  let calls = 0
  await withFetch((url) => {
    if (url.includes('/projects')) return json({ results: [{ id: 'p', name: 'Work' }] })
    return calls++ === 0 ? json({ items: [{ completed_at: today, project_id: 'p' }], next_cursor: 'c2' }) : json({ items: [{ completed_at: today, project_id: 'p' }], next_cursor: null })
  }, () => todoist.sync(ctx))
  assert.equal(calls, 2)
  assert.ok(events.some((e) => (e.body as { done: number; topProject?: string }).done === 2 && (e.body as { topProject?: string }).topProject === 'Work'))
})

test('Steam starts counting afresh when the profile changes', async () => {
  const { setKeys } = await import('@/core/env')
  setKeys(new Map([['STEAM_API_KEY', 'k'], ['STEAM_ID', '76561197960287930']]))
  const { ctx, events } = ctxFor({ day: '2000-01-01', games: { 1: 100 }, today: {}, profile: { input: '76561197960287931', id: '76561197960287931' } })
  await withFetch(() => json({ response: { game_count: 1, games: [{ appid: 1, name: 'G', playtime_forever: 500 }] } }), () => steam.sync(ctx))
  assert.equal(events.length, 0) // not 400 minutes of "today" from the other profile's numbers
})
