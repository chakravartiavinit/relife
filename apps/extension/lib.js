// Shared by the background worker (importScripts), the popup and the options page (<script>): settings defaults,
// the library item key rule, small formatters, the toast and the connection test. Plain script, no build step; everything hangs off self.RL.

;(() => {
  const DEFAULTS = {
    server: 'http://127.0.0.1:3030', token: '', paused: false, exclude: [], courses: {},
    // Show today's quests left on the toolbar icon.
    badge: true,
  }

  // Same order and colours as the app's Activity page (src/ui/activity-colors.ts).
  const KINDS = [
    ['learning', 'Learning', 'var(--cat-skills)'], ['work', 'Deep work', 'var(--pill)'], ['entertainment', 'Fun', 'var(--cat-health)'],
    ['social', 'Social', 'var(--cat-mind)'], ['communication', 'Messages', 'var(--cat-relationships)'], ['shopping', 'Shopping', 'var(--cat-wealth)'],
    ['news', 'News', 'var(--cat-hobbies)'], ['other', 'Other', 'var(--ink-3)'],
  ]
  const KIND = Object.fromEntries(KINDS.map(([k, label, color]) => [k, { label, color }]))
  // Library item types, as the popup's Track form offers them.
  const TYPES = [['course', 'Course'], ['show', 'Show'], ['video', 'Series'], ['book', 'Book'], ['other', 'Other']]
  const TYPE_LABEL = Object.fromEntries(TYPES)
  // Life areas (src/db/schema.ts CATEGORIES) and their colours (src/ui/tokens.ts).
  const AREA_COLOR = {
    health: 'var(--cat-health)', mind: 'var(--cat-mind)', skills: 'var(--cat-skills)', wealth: 'var(--cat-wealth)',
    hobbies: 'var(--cat-hobbies)', relationships: 'var(--cat-relationships)',
  }

  const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) })

  function domainOf(url) {
    try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null } catch { return null }
  }

  /**
   * Library item key for a URL: a YouTube playlist, or the site plus the first two parts of the path
   * (app.100xdevs.com/new-courses/13).
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

  /** Whether address `a` is the item `k` or a page under it ("site/course/1" is not under "site/course/13"). */
  const under = (a, k) => a === k || a.startsWith(k.endsWith('/') ? k : `${k}/`)

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  /** Seconds as "45m" or "2h 05m". */
  const hm = (sec) => { const m = Math.round(sec / 60); return m < 1 ? (sec > 0 ? '<1m' : '0m') : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
  /** "just now", "4 min ago", "3 h ago", "2 days ago". */
  const ago = (at) => {
    const m = Math.round((Date.now() - at) / 60_000)
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
  }
  /** 1234.5 → "1,235"; small fractions keep one decimal. */
  const num = (v) => (v == null ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) < 10 && v % 1 ? 1 : 0 }).format(v))

  /** Calls ReLife with the saved token. `{ ok, status, data }`; status 0 when ReLife can't be reached. */
  async function call(s, path, init = {}) {
    if (!s.token) return { ok: false, status: 0, data: null }
    try {
      const r = await fetch(`${s.server.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${s.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      })
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  const OFFLINE = 'Can’t reach ReLife at this address'

  /** "x of y" progress a page reported, if it's a real count (whole numbers, y above 1); else null. */
  const progressOf = (done, total) => (Number.isInteger(done) && Number.isInteger(total) && total > 1 && done >= 0 && done <= total ? { done, total } : null)

  /** Saves the address and token and tests them; the result is stored as `lastSync` and returned. */
  async function connect(serverText, tokenText) {
    const server = serverText.trim().replace(/\/$/, '') || DEFAULTS.server
    const token = tokenText.trim()
    await chrome.storage.local.set({ server, token })
    let lastSync
    try {
      const res = await fetch(`${server}/api/activity`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
      const error = res.ok ? undefined : res.status === 401 ? 'The token doesn’t match the one in ReLife' : `ReLife answered ${res.status}`
      lastSync = { at: Date.now(), ok: res.ok, status: res.status, ...(error ? { error } : {}) }
    } catch {
      lastSync = { at: Date.now(), ok: false, status: 0, error: OFFLINE }
    }
    await chrome.storage.local.set({ lastSync })
    return lastSync
  }

  // ── Pairing (flow B of the server's device API: this extension shows a code, you type it in the app) ─────────────────

  const LOOPBACK = /^(127\.0\.0\.1|localhost)$/

  /** "mac.local:3030" or "http://127.0.0.1:3030/" → "http://127.0.0.1:3030"; the default for empty text, null when it isn't an address. */
  function serverOf(text) {
    const t = text.trim()
    if (!t) return DEFAULTS.server
    try {
      const u = new URL(/^https?:\/\//i.test(t) ? t : `http://${t}`)
      return u.hostname ? u.origin : null
    } catch { return null }
  }

  /** Match pattern for every page on the address's host, which is what Chrome asks the user to allow. */
  const hostPattern = (server) => { const u = new URL(server); return `${u.protocol}//${u.hostname}/*` }

  /**
   * Whether the extension may talk to this address. This computer's own (127.0.0.1, localhost) is allowed at install; any
   * other needs the user's yes, so call it straight from a click.
   */
  async function allowServer(server) {
    try {
      if (LOOPBACK.test(new URL(server).hostname)) return true
      return await chrome.permissions.request({ origins: [hostPattern(server)] })
    } catch { return false }
  }

  /** "Chrome on macOS": how the approve screen names this browser. */
  function deviceName() {
    const data = /** @type {any} */ (navigator).userAgentData
    const brand = data?.brands?.find((b) => !/^(Chromium|Not.*Brand)/i.test(b.brand))?.brand
    return `${(brand ?? 'Chrome').replace(/^Google /, '')} on ${data?.platform || 'this computer'}`.slice(0, 80)
  }

  /** Whether version `a` is older than `b` ("0.7.0" < "0.10.0"). */
  const older = (a, b) => {
    const [x, y] = [a, b].map((v) => v.split('.').map(Number))
    for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0)
    return false
  }

  /** A call with no token: the server's public pairing routes. `{ ok, status, data }`; status 0 when it can't be reached. */
  async function open(server, path, body) {
    try {
      const r = await fetch(`${server}${path}`, {
        method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(10_000),
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      })
      return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }
    } catch { return { ok: false, status: 0, data: null } }
  }
  const said = (r, fallback) => (typeof r.data?.error?.message === 'string' ? r.data.error.message : fallback)

  /**
   * Asks the server at `server` to let this browser in. `{ started }` holds the code to show (`userCode`, XXXX-XXXX), the
   * link that opens the approve screen and what `pairPoll` needs; else `{ error }` says what to tell the user.
   */
  async function pairStart(server) {
    const hello = await open(server, '/api/v1/hello')
    if (!hello.status) return { error: OFFLINE }
    if (hello.status === 404) return { error: 'This server is too old to pair. Paste a token instead.' }
    if (hello.data?.app !== 'relife') return { error: 'That address isn’t this app’s server' }
    const need = hello.data.minClient?.extension
    if (need && older(chrome.runtime.getManifest().version, need)) return { error: `This server needs extension version ${need} or newer. Update the extension.` }
    const r = await open(server, '/api/v1/pair/requests', { kind: 'extension', name: deviceName(), platform: navigator.platform.slice(0, 80) })
    if (!r.ok || !r.data?.userCode) return { error: said(r, r.status === 429 ? 'Too many tries. Wait a few minutes.' : `The server answered ${r.status}`) }
    return { started: /** @type {import('@relife/contract').PairRequestStarted} */ (r.data) }
  }

  /**
   * One check on a pairing request: `pending`, `approved` (with the `token`, which the server hands out once), `denied`,
   * `expired`, or `slow` (asked too soon; wait longer); `error` carries a message when the server can't be reached.
   */
  /** @param {string} server @param {import('@relife/contract').PairRequestStarted} started @returns {Promise<import('./globals').PairStatus>} */
  async function pairPoll(server, started) {
    const r = await open(server, `/api/v1/pair/requests/${started.id}/poll`, { pollSecret: started.pollSecret })
    if (r.status === 429) return { status: 'slow' }
    if (!r.status) return { status: 'error', error: OFFLINE }
    if (r.status === 404) return { status: 'expired' }
    if (!r.ok) return { status: 'error', error: said(r, `The server answered ${r.status}`) }
    return r.data?.status ? /** @type {import('@relife/contract').PairPoll} */ (r.data) : { status: 'error' }
  }

  let toastTimer
  /** A short message in the page's #toast. */
  function toast(text, tone) {
    const t = document.getElementById('toast')
    t.textContent = text
    t.dataset.tone = tone ?? ''
    t.toggleAttribute('data-show', true)
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.removeAttribute('data-show'), 3200)
  }

  self.RL = { DEFAULTS, KINDS: /** @type {[string, string, string][]} */ (KINDS), KIND, TYPES: /** @type {[string, string][]} */ (TYPES), TYPE_LABEL, AREA_COLOR, OFFLINE, progressOf, settings, domainOf, keyOf, under, esc, hm, ago, num, call, connect, toast, serverOf, hostPattern, allowServer, pairStart, pairPoll }
  if (typeof module === 'object') module.exports = self.RL
})()
