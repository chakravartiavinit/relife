// ReLife extension: measures focused time on each page and sends it to your own ReLife server.
//
// A "stretch" starts when a page is in front and you're active (or a video is playing), and ends when you
// switch tabs, leave the browser, go idle, or the page changes. Every 30 seconds the open stretch and any
// closed ones are posted to ReLife (/api/activity). Nothing is sent anywhere else. Incognito is never
// tracked, and you can pause tracking or exclude sites from the popup.

const DEFAULTS = { server: 'http://127.0.0.1:3030', token: '', paused: false, exclude: [], courses: {} }
const IDLE_SECONDS = 120

const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) })
const session = {
  get: async () => (await chrome.storage.session.get(['open', 'queue', 'pages', 'frames'])),
  set: (v) => chrome.storage.session.set(v),
}

/** What a content script told us about a tab: title, channel, video playing, course hints. */
async function pageInfo(tabId) {
  const { pages = {}, frames = {} } = await session.get()
  // A video in an embedded player (course sites often use one) counts as playing for the whole tab.
  const framePlaying = Object.values(frames[tabId] ?? {}).some(Boolean)
  const info = pages[tabId] ?? {}
  return { ...info, playing: info.playing || framePlaying }
}

function domainOf(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null } catch { return null }
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

/**
 * Library item key for a URL: a YouTube playlist, or the site plus the first two parts of the path
 * (app.100xdevs.com/new-courses/13). Shared with the popup.
 */
function keyOf(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const list = /(^|\.)youtube\.com$/.test(host) && u.searchParams.get('list')
    if (list) return `youtube.com/list/${list}`
    return `${host}/${u.pathname.split('/').filter(Boolean).slice(0, 2).join('/')}`
  } catch { return null }
}

/** The tracked item this page belongs to: by its own address, or by the series it's part of (episodes). */
function courseFor(s, domain, path, info, url) {
  const keys = Object.keys(s.courses)
  const own = `${domain}${path}`
  const seriesKey = info.series?.url ? keyOf(info.series.url) : null
  const pageKey = keyOf(url)
  const key = keys.find((k) => own.startsWith(k) || k === pageKey || (seriesKey && (seriesKey === k || seriesKey.startsWith(k))))
  if (!key) return null
  const c = s.courses[key]
  return { title: c.title, kind: c.kind, url: c.url ?? `https://${key}`, track: true }
}

// Events arrive in bursts (tab switch + focus + page info); run samples one at a time so they don't
// overwrite each other's open stretch.
let chain = Promise.resolve()
function sample(reason) {
  chain = chain.then(() => sampleNow(reason)).catch(() => {})
  return chain
}

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
        next = { domain, path, title: info.title || tab.title || '', meta: {} }
        if (info.channel) next.meta.channel = info.channel
        if (info.playing) next.meta.playing = true
        const course = courseFor(s, domain, path, info, tab.url)
        // The current lesson or episode: the page's lesson name, else its title.
        const lesson = info.lesson || (course && (info.title || tab.title || '').replace(/\s*[-|–]\s*(Watch on )?[^-|–]+$/, '').trim())
        // The page's picture (or icon) too, so items tracked before pictures existed get one.
        if (course) next.meta.course = { ...course, ...(lesson ? { lesson: lesson.slice(0, 200) } : {}), ...(info.done != null ? { done: info.done, total: info.total } : {}), ...(info.image ? { image: info.image } : info.icon ? { icon: info.icon } : {}) }
      }
    }
  }

  const same = open && next && open.domain === next.domain && open.path === next.path && open.title === next.title
  if (open && !same) {
    // Close where we last saw it, so idle gaps and closed lids don't count.
    queue.push(open)
  }
  const current = same ? { ...open, end: now, meta: next.meta } : next ? { id: crypto.randomUUID(), source: 'browser', ...next, start: now, end: now } : null
  await session.set({ open: current, queue })
  if (reason === 'alarm') await flush()
}

async function flush() {
  const s = await settings()
  if (!s.token) return
  const { open = null, queue = [] } = await session.get()
  const { pendingCourses = [], pendingRules = [] } = await chrome.storage.local.get(['pendingCourses', 'pendingRules'])
  const segments = [...queue, ...(open && open.end - open.start >= 5000 ? [open] : [])]
    .filter((x) => x.end - x.start >= 5000)
    .map((x) => ({ ...x, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString() }))
  if (!segments.length && !pendingCourses.length && !pendingRules.length) { if (queue.length) await session.set({ queue: [] }); return }
  try {
    const res = await fetch(`${s.server.replace(/\/$/, '')}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
      body: JSON.stringify({ segments: segments.slice(0, 500), courses: pendingCourses, rules: pendingRules }),
    })
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: res.ok, status: res.status } })
    if (res.ok) {
      if (pendingCourses.length || pendingRules.length) await chrome.storage.local.set({ pendingCourses: [], pendingRules: [] })
      // Closed stretches are done; the open one keeps its id and is re-sent as it grows.
      const { queue: latest = [] } = await session.get()
      await session.set({ queue: latest.slice(queue.length) })
    }
  } catch {
    await chrome.storage.local.set({ lastSync: { at: Date.now(), ok: false, status: 0 } })
    // Offline or ReLife isn't running: keep the queue (capped) and try again next time.
    const { queue: latest = [] } = await session.get()
    if (latest.length > 2000) await session.set({ queue: latest.slice(-2000) })
  }
}

chrome.alarms.create('tick', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'tick') void sample('alarm') })
chrome.tabs.onActivated.addListener(() => void sample('tab'))
chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.title) void sample('update') })
chrome.windows.onFocusChanged.addListener(() => void sample('focus'))
chrome.idle.setDetectionInterval(IDLE_SECONDS)
chrome.idle.onStateChanged.addListener(() => void sample('idle'))
chrome.tabs.onRemoved.addListener(async (id) => {
  const { pages = {}, frames = {} } = await session.get()
  delete pages[id]
  delete frames[id]
  await session.set({ pages, frames })
  void sample('closed')
})

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'page' && sender.tab) {
    void (async () => {
      const { pages = {} } = await session.get()
      pages[sender.tab.id] = msg.info
      await session.set({ pages })
      if (sender.tab.active) await sample('page')
    })()
  }
  if (msg.type === 'frame' && sender.tab) {
    void (async () => {
      const { frames = {} } = await session.get()
      frames[sender.tab.id] = { ...(frames[sender.tab.id] ?? {}), [sender.frameId]: msg.playing }
      await session.set({ frames })
    })()
  }
  // Popup: "Track this course" saves the course and sends it at once, so it shows in ReLife right away.
  if (msg.type === 'track-course') {
    void (async () => {
      const { pendingCourses = [] } = await chrome.storage.local.get('pendingCourses')
      await chrome.storage.local.set({ pendingCourses: [...pendingCourses, msg.course] })
      await sample('alarm')
      const { lastSync } = await chrome.storage.local.get('lastSync')
      reply({ ok: !!lastSync?.ok })
    })()
  }
  if (msg.type === 'site-kind') {
    void (async () => {
      const { pendingRules = [] } = await chrome.storage.local.get('pendingRules')
      await chrome.storage.local.set({ pendingRules: [...pendingRules.filter((r) => r.domain !== msg.domain), { domain: msg.domain, kind: msg.kind }] })
      await sample('alarm')
      const { lastSync } = await chrome.storage.local.get('lastSync')
      reply({ ok: !!lastSync?.ok })
    })()
  }
  if (msg.type === 'flush') void sample('alarm').then(() => reply({ ok: true }))
  return msg.type === 'flush' || msg.type === 'track-course' || msg.type === 'site-kind'
})

// After an install or update, send every course you've chosen, so ones saved before an update (or while
// ReLife was off) still reach it. Creating a course twice just updates it.
chrome.runtime.onInstalled.addListener(async () => {
  const { courses = {}, pendingCourses = [] } = await chrome.storage.local.get(['courses', 'pendingCourses'])
  const all = Object.entries(courses).map(([key, c]) => {
    const [domain, ...rest] = key.split('/')
    return { domain, path: `/${rest.join('/')}`, title: c.title, url: c.url ?? `https://${key}`, ...(c.kind ? { kind: c.kind } : {}) }
  })
  if (all.length) await chrome.storage.local.set({ pendingCourses: [...pendingCourses, ...all] })
  void sample('alarm')
})
