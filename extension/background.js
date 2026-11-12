// ReLife extension: measures focused time on each page and sends it to your own ReLife server.
//
// A "stretch" starts when a page is in front and you're active (or a video is playing), and ends when you
// switch tabs, leave the browser, go idle, or the page changes. Every 30 seconds the open stretch and any
// closed ones are posted to ReLife (/api/activity). Nothing is sent anywhere else. Incognito is never
// tracked, and you can pause tracking or exclude sites from the popup.
//
// It also keeps the toolbar badge current (quests left today, or a paused / offline mark), answers the keyboard
// shortcuts and the icon's right-click menu, and caches the popup's Today data so the popup opens instantly.

importScripts('lib.js')
const { OFFLINE, settings, domainOf, keyOf, under, call } = self.RL

const IDLE_SECONDS = 120
// A player iframe reports every 20 seconds; one silent for longer was closed or navigated away.
const FRAME_STALE_MS = 60_000
// What ReLife accepts per post (src/app/api/activity/route.ts).
const MAX_SEGMENTS = 500
const MAX_COURSES = 20
// Unsent stretches kept while ReLife is off. They live in local storage, so a browser restart doesn't lose them.
const MAX_QUEUE = 2000
// The Today data behind the badge is refreshed this often while you browse (the popup refreshes it on open).
const COMPANION_EVERY_MS = 2 * 60_000

// Per-browser-session state (the open stretch, what each tab's page said) is in session storage; the queue of
// closed stretches is in local storage so it survives a restart.
const session = {
  get: async () => {
    const [ses, loc] = await Promise.all([chrome.storage.session.get(['open', 'pages', 'frames']), chrome.storage.local.get('queue')])
    return { ...ses, queue: loc.queue }
  },
  set: async ({ queue, ...rest }) => {
    await Promise.all([
      Object.keys(rest).length ? chrome.storage.session.set(rest) : null,
      // Capped on every write: ReLife answering with an error (wrong token, DB down) must not grow it forever.
      queue !== undefined ? chrome.storage.local.set({ queue: queue.slice(-MAX_QUEUE) }) : null,
    ])
  },
}

/** What a content script told us about a tab: title, channel, video playing, course hints. */
async function pageInfo(tabId) {
  const { pages = {}, frames = {} } = await session.get()
  // A video in an embedded player (course sites often use one) counts as playing for the whole tab.
  const fr = Object.values(frames[tabId] ?? {}).filter((f) => f && Date.now() - (f.at ?? 0) < FRAME_STALE_MS)
  const framePlaying = fr.some((f) => f?.playing)
  const info = pages[tabId] ?? {}
  // A player in an iframe (Crunchyroll, most course sites) knows the episode's length and position.
  const clock = fr.filter((f) => f?.duration).sort((a, b) => b.duration - a.duration)[0]
  const media = info.media && clock && !info.media.duration ? { ...info.media, duration: clock.duration, position: clock.position } : info.media
  return { ...info, media, playing: info.playing || framePlaying }
}

function pathOf(url) {
  try { return new URL(url).pathname } catch { return '' }
}

/** The tab in front of the focused window, if any. */
async function frontTab() {
  // 'app' too: courses installed as web apps open in their own app window.
  const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ['normal', 'popup', 'app'] }).catch(() => null)
  if (!win || !win.focused || win.incognito) return null
  return win.tabs?.find((t) => t.active) ?? null
}

/** The tracked item this page belongs to: by its own address, or by the series it's part of (episodes). */
function courseFor(s, domain, path, info, url) {
  const keys = Object.keys(s.courses)
  const own = `${domain}${path}`
  const seriesKey = info.series?.url ? keyOf(info.series.url) : null
  const pageKey = keyOf(url)
  const key = keys.find((k) => under(own, k) || k === pageKey || (seriesKey && under(seriesKey, k)))
  if (!key) return null
  const c = s.courses[key]
  return { title: c.title, kind: c.kind, url: c.url ?? `https://${key}`, track: true }
}

/**
 * While an episode of a series plays (a show, an anime, a course lesson), its series counts as tracked even if you
 * never pressed "Track this": ReLife adds it to the library and logs the episode. Not while just browsing.
 */
function autoSeries(info, url) {
  const m = info.media
  if (!m?.series || !info.playing) return null
  const key = m.seriesUrl ? keyOf(m.seriesUrl) : keyOf(url)
  return { title: m.series, url: m.seriesUrl ?? (key ? `https://${key}` : url), track: true, auto: true }
}

// Page text can be any length; ReLife rejects a post with an over-long field, so clip before sending.
const clip = (t, n) => (typeof t === 'string' && t ? t.slice(0, n) : undefined)
const url = (u, n) => (typeof u === 'string' && /^https?:/.test(u) && u.length <= n ? u : undefined)
const whole = (v) => (Number.isInteger(v) && v >= 0 ? v : undefined)
const seconds = (v) => (Number.isFinite(v) && v >= 0 && v <= 86_400 ? Math.round(v) : undefined)
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))

/** The episode for the watch log, cleaned to what ReLife accepts. */
const episodeOf = (m) => {
  const e = defined({ episode: clip(m.episode, 200), number: whole(m.number), season: whole(m.season), duration: seconds(m.duration), position: seconds(m.position) })
  return Object.keys(e).length ? e : undefined
}

// Events arrive in bursts (tab switch + focus + page info). Everything that reads and writes session storage
// runs one at a time, so a sample and a page report never overwrite each other.
let chain = Promise.resolve()
function serial(fn) {
  chain = chain.then(fn).catch(() => {})
  return chain
}
const sample = (reason) => serial(() => sampleNow(reason))

async function sampleNow(reason) {
  const s = await settings()
  const { open = null, queue = [] } = await session.get()
  const now = Date.now()
  let next = null

  if (!s.paused && s.token) {
    const tab = await frontTab()
    const domain = tab && domainOf(tab.url)
    if (tab && domain && !s.exclude.includes(domain)) {
      const info = await pageInfo(tab.id)
      const idle = await chrome.idle.queryState(IDLE_SECONDS)
      if (idle === 'active' || info.playing) {
        const path = pathOf(tab.url)
        next = { domain: domain.slice(0, 200), path: path.slice(0, 500), title: (info.title || tab.title || '').slice(0, 500), meta: {} }
        if (info.channel) next.meta.channel = clip(info.channel, 200)
        if (info.playing) next.meta.playing = true
        // A tracked item, or (while an episode plays) its series, added to the library on its own.
        const course = courseFor(s, domain, path, info, tab.url) ?? autoSeries(info, tab.url)
        // The current lesson or episode: the page's lesson name, else its title.
        const lesson = info.lesson || (course && (info.title || tab.title || '').replace(/\s*[-|–]\s*(Watch on )?[^-|–]+$/, '').trim())
        // The page's picture (or icon) too, so items tracked before pictures existed get one.
        if (course?.title) {
          const image = url(info.image, 1000), icon = url(info.icon, 1000)
          next.meta.course = defined({
            ...course, title: clip(course.title, 200), url: url(course.url, 500), lesson: clip(lesson, 200),
            ...(Number.isFinite(info.done) && Number.isFinite(info.total) ? { done: info.done, total: info.total } : {}),
            ...(image ? { image } : icon ? { icon } : {}),
            // The episode itself, for the watch log: its name, number, length and how far in you are.
            episode: info.media ? episodeOf(info.media) : undefined,
          })
        }
      }
    }
  }

  const same = open && next && open.domain === next.domain && open.path === next.path && open.title === next.title
  if (open && !same) {
    // Close where we last saw it, so idle gaps and closed lids don't count.
    queue.push(open)
  }
  const current = same ? { ...open, end: now, meta: next.meta } : next ? { id: crypto.randomUUID(), source: 'browser', ...next, start: now, end: now } : null
  // The queue is only rewritten when a stretch closed; most samples just extend the open one.
  await session.set({ open: current, ...(open && !same ? { queue } : {}) })
  if (reason === 'alarm') await flush()
}

async function flush() {
  const s = await settings()
  if (!s.token) return
  const { open = null, queue = [] } = await session.get()
  const { pendingCourses = [], pendingRules = [] } = await chrome.storage.local.get(['pendingCourses', 'pendingRules'])
  // A batch at a time: after a long time offline the queue holds more than one post may carry.
  const batch = queue.slice(0, MAX_SEGMENTS - 1)
  const courses = pendingCourses.slice(0, MAX_COURSES)
  const rules = pendingRules.slice(0, MAX_COURSES)
  const segments = [...batch, ...(open ? [open] : [])]
    .filter((x) => x.end - x.start >= 5000)
    .map((x) => ({ ...x, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString() }))
  const empty = !segments.length && !courses.length && !rules.length
  if (empty && batch.length) await session.set({ queue: queue.slice(batch.length) })
  // Nothing to send: still check ReLife answers, so the badge and "Send now" don't trust an old success.
  const res = empty
    ? await call(s, '/api/activity')
    : await call(s, '/api/activity', { method: 'POST', body: JSON.stringify({ segments, courses, rules }) })
  if (!res.status) {
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, status: 0, error: OFFLINE } })
    // Offline or ReLife isn't running: keep the queue (capped) and try again next time.
    const { queue: latest = [] } = await session.get()
    if (latest.length > MAX_QUEUE) await session.set({ queue: latest.slice(-MAX_QUEUE) })
    return
  }
  // ReLife's own words on a failure (a wrong token, not connected yet), for the options page.
  const error = res.ok ? undefined : (res.data?.error ?? (res.status === 401 ? 'The token doesn’t match the one in ReLife' : `ReLife answered ${res.status}`))
  await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: res.ok, status: res.status, ...(error ? { error: String(error).slice(0, 200) } : {}) } })
  // 400 means ReLife can't read this batch, and it never will: drop it rather than retry it forever and block
  // everything after it. Other failures (ReLife restarting, a wrong token) keep it for next time.
  if (!empty && (res.ok || res.status === 400)) {
    await chrome.storage.local.set({ pendingCourses: pendingCourses.slice(courses.length), pendingRules: pendingRules.slice(rules.length) })
    // Closed stretches are done; the open one keeps its id and is re-sent as it grows.
    const { queue: latest = [] } = await session.get()
    await session.set({ queue: latest.slice(batch.length) })
  }
}

// ── Today data and the toolbar badge ─────────────────────────────────────────────────────────────

/**
 * Fetches the popup's Today data (character, quests, routines) into local storage, at most every two minutes
 * unless forced. The popup paints from this copy first. A ReLife without /api/companion (older) answers 404.
 */
async function refreshCompanion(force = false) {
  const s = await settings()
  if (!s.token) return
  const { companion } = await chrome.storage.local.get('companion')
  if (!force && companion?.at && Date.now() - companion.at < COMPANION_EVERY_MS) return
  const r = await call(s, '/api/companion')
  if (r.ok && r.data) await chrome.storage.local.set({ companion: { at: Date.now(), view: r.data } })
  else if (r.status === 404) await chrome.storage.local.set({ companion: { at: Date.now(), view: null, unsupported: true } })
}

// Badge colours: the popup's --pill, --good, --bad and --ink-3 in light mode (the badge takes plain colours only).
const BADGE = { pill: '#3f8fd8', good: '#2e8a5b', bad: '#c2413b', muted: '#6b7280' }

/** The toolbar icon says what's going on without opening the popup. */
async function renderBadge() {
  const s = await settings()
  const { lastSync, companion } = await chrome.storage.local.get(['lastSync', 'companion'])
  const left = companion?.view?.left
  // A 400 drops one unreadable batch and carries on, so it isn't "offline"; anything else that failed is.
  const offline = lastSync && !lastSync.ok && lastSync.status !== 400
  const [text, color, title] =
    !s.token ? ['', BADGE.muted, 'ReLife: not set up yet']
      : s.paused ? ['off', BADGE.muted, 'ReLife: tracking paused']
        : offline ? ['!', BADGE.bad, `ReLife: ${lastSync.error ?? 'can’t reach ReLife'}`]
          : !s.badge || left == null ? ['', BADGE.pill, 'ReLife: tracking']
            : left > 0 ? [String(Math.min(left, 99)), BADGE.pill, `ReLife: ${left} ${left === 1 ? 'quest' : 'quests'} left today`]
              : ['✓', BADGE.good, 'ReLife: everything done today']
  await chrome.action.setBadgeText({ text })
  await chrome.action.setBadgeBackgroundColor({ color })
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' })
  await chrome.action.setTitle({ title })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (['token', 'server', 'paused', 'badge', 'lastSync', 'companion'].some((k) => k in changes)) void renderBadge()
  if ('paused' in changes) void renderMenus()
  // A new address or token: what the badge counts came from the old one.
  if ('token' in changes || 'server' in changes) void chrome.storage.local.remove('companion').then(() => refreshCompanion(true))
})

// ── Shortcuts and the icon's right-click menu ────────────────────────────────────────────────────

async function togglePause() {
  const s = await settings()
  await chrome.storage.local.set({ paused: !s.paused })
  // Close the open stretch now, so time spent paused never joins it.
  await sample('pause')
}

async function renderMenus() {
  const s = await settings()
  chrome.contextMenus.update('pause', { title: s.paused ? 'Resume tracking' : 'Pause tracking' }, () => void chrome.runtime.lastError)
}

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'pause', title: 'Pause tracking', contexts: ['action'] })
    chrome.contextMenus.create({ id: 'send', title: 'Send to ReLife now', contexts: ['action'] })
    chrome.contextMenus.create({ id: 'app', title: 'Open ReLife', contexts: ['action'] })
    void renderMenus()
  })
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'pause') void togglePause()
  if (info.menuItemId === 'send') void sample('alarm').then(() => refreshCompanion(true))
  if (info.menuItemId === 'app') void settings().then((s) => chrome.tabs.create({ url: s.server }))
})
chrome.commands.onCommand.addListener((command) => { if (command === 'toggle-pause') void togglePause() })

chrome.alarms.create('tick', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== 'tick') return
  void sample('alarm').then(async () => { if (!(await settings()).paused) await refreshCompanion() })
})
chrome.tabs.onActivated.addListener(() => void sample('tab'))
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.title) void sample('update') })
chrome.windows.onFocusChanged.addListener(() => void sample('focus'))
chrome.idle.setDetectionInterval(IDLE_SECONDS)
chrome.idle.onStateChanged.addListener(() => void sample('idle'))
chrome.tabs.onRemoved.addListener((id) => void serial(async () => {
  const { pages = {}, frames = {} } = await session.get()
  delete pages[id]
  delete frames[id]
  await session.set({ pages, frames })
}).then(() => sample('closed')))

/**
 * Adds to a pending list (courses or site kinds) and sends at once, so it shows in ReLife right away. Queued with
 * the uploads, so one in flight can't drop it when it clears what it sent. `{ ok }`: whether it got through.
 */
async function queueAndSend(key, update) {
  await serial(async () => {
    const { [key]: list = [] } = await chrome.storage.local.get(key)
    await chrome.storage.local.set({ [key]: update(list) })
  })
  await sample('alarm')
  const { lastSync } = await chrome.storage.local.get('lastSync')
  return { ok: !!lastSync?.ok }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'page' && sender.tab) {
    void serial(async () => {
      const { pages = {} } = await session.get()
      pages[sender.tab.id] = msg.info
      await session.set({ pages })
    }).then(() => { if (sender.tab.active) return sample('page') })
  }
  if (msg.type === 'frame' && sender.tab) {
    void serial(async () => {
      const { frames = {} } = await session.get()
      frames[sender.tab.id] = { ...(frames[sender.tab.id] ?? {}), [sender.frameId]: { playing: msg.playing, duration: msg.duration, position: msg.position, at: Date.now() } }
      await session.set({ frames })
    })
  }
  // Popup: "Track this course" and a site's kind.
  if (msg.type === 'track-course') void queueAndSend('pendingCourses', (list) => [...list, msg.course]).then(reply)
  if (msg.type === 'site-kind') {
    void queueAndSend('pendingRules', (list) => [...list.filter((r) => r.domain !== msg.domain), { domain: msg.domain, kind: msg.kind }]).then(reply)
  }
  if (msg.type === 'flush') void sample('alarm').then(() => reply({ ok: true }))
  return msg.type === 'flush' || msg.type === 'track-course' || msg.type === 'site-kind'
})

chrome.runtime.onStartup.addListener(() => { void renderBadge(); void refreshCompanion(true) })

// After an install or update, send every course you've chosen, so ones saved before an update (or while
// ReLife was off) still reach it. Creating a course twice just updates it.
chrome.runtime.onInstalled.addListener(() => void serial(async () => {
  createMenus()
  const { courses = {}, pendingCourses = [] } = await chrome.storage.local.get(['courses', 'pendingCourses'])
  const all = Object.entries(courses).map(([key, c]) => {
    const [domain, ...rest] = key.split('/')
    return { domain, path: `/${rest.join('/')}`, title: c.title, url: c.url ?? `https://${key}`, ...(c.kind ? { kind: c.kind } : {}) }
  })
  // One entry per item: an update while ReLife is off mustn't pile up copies.
  const byKey = new Map([...pendingCourses, ...all].map((c) => [`${c.domain}${c.path}`, c]))
  if (all.length) await chrome.storage.local.set({ pendingCourses: [...byKey.values()] })
}).then(() => sample('alarm')).then(() => refreshCompanion(true)).then(renderBadge))
